"""Event → detect → publish dispatcher.

Per-event flow when a `wearable.vitals.uploaded` event arrives:

  1. Extract patient_id (subject, fall back to data.patient_id).
  2. Throttle by patient — burst uploads from one wearable shouldn't
     re-scan every sample.
  3. Fetch the patient's recent vitals from EHR (last N hours).
  4. Run the detectors on each sample.
  5. If anything fired, publish `vitals.anomaly.detected` with the full
     anomaly list. **Empty anomaly lists are not published** — silence on
     the bus equals "no anomalies."

The dispatcher takes its fetch and publish functions as callables so unit
tests can run end-to-end with no broker and no HTTP.
"""
from __future__ import annotations

import asyncio
import logging
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from typing import Any

from agents.shared.events import DomainEvent

from .detectors import Anomaly, detect_all, parse_reading

logger = logging.getLogger(__name__)


# Public type aliases for the injected dependencies.
FetchVitalsFn = Callable[[str, int], Awaitable[list[dict[str, Any]]]]
"""(patient_id, hours_back) -> list of raw vital dicts."""

PublishFn = Callable[..., Awaitable[None]]
"""Matches `EventPublisher.publish(event_type=, subject=, data=)`."""

NotifyFn = Callable[..., Awaitable[bool]]
"""Matches `NotificationDispatcher.notify(patient_id=, severity=, ...)`.
   Optional — pass None to skip notifications entirely (testing or
   pull-mode-only deployments)."""


class AnomalyDispatcher:
    """Receives upload events, emits anomaly events.

    Throttle is per-patient. Acute monitoring wants quick reactions, so the
    default interval is shorter than Smart Recommend's longitudinal window.
    """

    def __init__(
        self,
        *,
        fetch_vitals: FetchVitalsFn,
        publish: PublishFn,
        notify: NotifyFn | None = None,
        min_interval_seconds: int = 60,
        scan_hours_back: int = 6,
        capacity: int = 1024,
    ) -> None:
        self._fetch_vitals = fetch_vitals
        self._publish = publish
        self._notify = notify
        self._min_interval = timedelta(seconds=min_interval_seconds)
        self._scan_hours = scan_hours_back
        self._last_scanned: OrderedDict[str, datetime] = OrderedDict()
        self._capacity = capacity
        self._lock = asyncio.Lock()

    async def on_event(self, event: DomainEvent) -> None:
        patient_id = _extract_patient_id(event)
        if not patient_id:
            logger.warning(
                "vitals_dispatcher.no_patient_id event_type=%s", event.type
            )
            return

        if not await self._mark_for_scan(patient_id):
            logger.debug(
                "vitals_dispatcher.throttled patient=%s event_type=%s",
                patient_id,
                event.type,
            )
            return

        try:
            raw = await self._fetch_vitals(patient_id, self._scan_hours)
        except Exception:
            logger.exception("vitals_dispatcher.fetch_failed patient=%s", patient_id)
            return

        readings = [r for r in (parse_reading(s) for s in raw) if r is not None]
        anomalies = detect_all(readings)
        if not anomalies:
            return

        # Carry the device descriptor through if the upstream event included it
        # — downstream notifications can show "fitbit-99: HR 175 bpm".
        device = (event.data or {}).get("device") if isinstance(event.data, dict) else None
        await self._emit_anomaly_event(patient_id, anomalies, device=device)

    async def _mark_for_scan(self, patient_id: str) -> bool:
        async with self._lock:
            now = datetime.now(timezone.utc)
            last = self._last_scanned.get(patient_id)
            if last is not None and (now - last) < self._min_interval:
                self._last_scanned.move_to_end(patient_id)
                return False
            self._last_scanned[patient_id] = now
            self._last_scanned.move_to_end(patient_id)
            while len(self._last_scanned) > self._capacity:
                self._last_scanned.popitem(last=False)
        return True

    async def _emit_anomaly_event(
        self,
        patient_id: str,
        anomalies: list[Anomaly],
        *,
        device: dict[str, Any] | None,
    ) -> None:
        # Anomalies are serialised verbatim. Severities ordered by event
        # consumers via the per-anomaly `severity` field — we surface the
        # highest at the top level so notification routers can branch on it
        # without scanning the array.
        highest = "critical" if any(a.severity == "critical" for a in anomalies) else "warning"
        payload: dict[str, Any] = {
            "patient_id": patient_id,
            "severity": highest,
            "anomalies": [_anomaly_to_dict(a) for a in anomalies],
        }
        if device:
            payload["device"] = device
        try:
            await self._publish(
                event_type="vitals.anomaly.detected",
                subject=patient_id,
                data=payload,
            )
        except Exception:
            # Should already be swallowed inside EventPublisher.publish, but
            # tighten the contract here too — never let a publish failure
            # break the dispatcher loop.
            logger.exception(
                "vitals_dispatcher.publish_failed patient=%s n_anomalies=%s",
                patient_id,
                len(anomalies),
            )

        # Patient-facing notification. Batched — one push per scan, not
        # one-per-anomaly — to avoid notification fatigue when several
        # metrics drift simultaneously. The notifier's own suppression
        # window de-duplicates repeat detections of the same issue.
        if self._notify is not None:
            await self._send_anomaly_notification(patient_id, anomalies, highest)

    async def _send_anomaly_notification(
        self,
        patient_id: str,
        anomalies: list[Anomaly],
        highest_severity: str,
    ) -> None:
        title = (
            "Important: vital sign needs attention"
            if highest_severity == "critical"
            else "Health note: vital reading flagged"
        )
        # Body lists the rationales for each anomaly. Short — push
        # notifications truncate aggressively; lead with the strongest.
        ordered = sorted(
            anomalies,
            key=lambda a: 0 if a.severity == "critical" else 1,
        )
        body_lines = [f"• {a.rationale}" for a in ordered[:3]]
        if len(anomalies) > 3:
            body_lines.append(f"…and {len(anomalies) - 3} more")
        body = "\n".join(body_lines)
        # Composite dedup so the same set of anomalies in the same scan
        # only notifies once even if the event is re-delivered.
        dedup_key = "|".join(sorted({a.dedup_key for a in anomalies if a.dedup_key}))
        try:
            await self._notify(  # type: ignore[misc]
                patient_id=patient_id,
                severity=highest_severity,
                event_type=f"vitals_watcher.{highest_severity}",
                title=title,
                body=body,
                dedup_key=dedup_key or None,
            )
        except Exception:
            # Notifier swallows internally; this is the belt-and-braces
            # net so a notification failure can never break the loop.
            logger.exception(
                "vitals_dispatcher.notify_failed patient=%s severity=%s",
                patient_id,
                highest_severity,
            )


# ── Helpers ─────────────────────────────────────────────────────────────────


def _extract_patient_id(event: DomainEvent) -> str | None:
    if event.subject:
        return event.subject
    if isinstance(event.data, dict):
        raw = event.data.get("patient_id")
        if isinstance(raw, str) and raw:
            return raw
    return None


def _anomaly_to_dict(a: Anomaly) -> dict[str, Any]:
    # `asdict` would serialise the datetime as-is; force isoformat so the
    # wire payload is JSON-stable.
    d = asdict(a)
    d["recorded_at"] = a.recorded_at.isoformat()
    return d


__all__ = ["AnomalyDispatcher", "FetchVitalsFn", "NotifyFn", "PublishFn"]
