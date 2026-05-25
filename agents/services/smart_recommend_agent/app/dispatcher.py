"""Event → analyze dispatcher.

Wraps the agent's pull-mode `analyze()` for use from the event subscriber.
Two responsibilities:

1. Extract a `patient_id` from the event. Convention (per user_service): the
   subject field carries the patient ID. We fall back to `data.patient_id`
   so producers that pre-date the convention still trigger analysis.
2. Throttle by patient. Five vitals uploaded in a row from one wearable
   shouldn't trigger five analyses — the same `Signal`s would result, and
   we already dedup writes by `dedup_key`. We just skip the work.

Throttle is an in-memory LRU keyed by patient_id. Per-pod, not cluster-wide
— see the README for the Redis upgrade path when scaling beyond one pod.
"""
from __future__ import annotations

import asyncio
import logging
from collections import OrderedDict
from datetime import datetime, timedelta, timezone

from agents.shared.events import DomainEvent

from .agent import AnalyzeRequest, SmartRecommendAgent

logger = logging.getLogger(__name__)


class AnalysisDispatcher:
    """Funnel events into the agent's analyze() with per-patient throttling."""

    def __init__(
        self,
        agent: SmartRecommendAgent,
        *,
        min_interval_seconds: int = 300,
        capacity: int = 1024,
    ) -> None:
        self._agent = agent
        self._min_interval = timedelta(seconds=min_interval_seconds)
        self._last_analyzed: OrderedDict[str, datetime] = OrderedDict()
        self._capacity = capacity
        self._lock = asyncio.Lock()

    async def on_event(self, event: DomainEvent) -> None:
        patient_id = _extract_patient_id(event)
        if not patient_id:
            logger.warning("dispatcher.no_patient_id event_type=%s", event.type)
            return

        if not await self._mark_for_analysis(patient_id):
            logger.debug(
                "dispatcher.throttled patient=%s event_type=%s",
                patient_id,
                event.type,
            )
            return

        logger.info(
            "dispatcher.analyzing patient=%s event_type=%s event_id=%s",
            patient_id,
            event.type,
            event.id,
        )
        try:
            await self._agent.analyze(
                AnalyzeRequest(patient_id=patient_id, trigger=event.type)
            )
        except Exception:
            logger.exception("dispatcher.analyze_failed patient=%s", patient_id)

    async def _mark_for_analysis(self, patient_id: str) -> bool:
        """Atomically check + record. Returns True if caller should analyze.

        Returns False if this patient was analyzed within `min_interval`.
        Updates the recency map either way (sliding window — quiet patients
        eventually fall off due to capacity, not staleness).
        """
        async with self._lock:
            now = datetime.now(timezone.utc)
            last = self._last_analyzed.get(patient_id)
            if last is not None and (now - last) < self._min_interval:
                # Refresh ordering — still seen recently.
                self._last_analyzed.move_to_end(patient_id)
                return False
            self._last_analyzed[patient_id] = now
            self._last_analyzed.move_to_end(patient_id)
            while len(self._last_analyzed) > self._capacity:
                self._last_analyzed.popitem(last=False)
        return True


def _extract_patient_id(event: DomainEvent) -> str | None:
    if event.subject:
        return event.subject
    raw = event.data.get("patient_id")
    if isinstance(raw, str) and raw:
        return raw
    return None
