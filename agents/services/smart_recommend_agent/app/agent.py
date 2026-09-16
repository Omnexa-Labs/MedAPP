"""Smart Recommendation agent.

Two execution paths:

  /analyze (synchronous trigger — slice 2 will wrap this in a RabbitMQ
            consumer):
      1. Gather context via async HTTP calls to backend services.
      2. Run the deterministic engine (rules + patterns) to produce Signals.
      3. Personalize Signals through the LLM into patient-facing text.
      4. Upsert each personalized recommendation into recommendation_memory.
      5. Return the list.

  /chat:
      Standard ChatTurn flow. The LLM may call get_open_recommendations to
      pull the patient's current recommendation feed and answer follow-ups.
      Never invents new recommendations; only discusses what the engine
      produced.

Architectural rule (vision doc): the LLM cannot invent signals — the engine
must produce them first. This file enforces that ordering. The /analyze
path runs the engine *before* the LLM ever sees the signals.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from pydantic import BaseModel, Field

from agents.shared import (
    AgentRequest,
    AgentResponse,
    BaseAgent,
    LLMChatTurn,
    NotificationDispatcher,
    load_prompt,
    make_memory_service_from_env,
    make_notification_dispatcher_from_env,
    make_provider,
)
from agents.shared.events import EventSubscriber

from .analyzer import analyze
from .config import settings
from .personalizer import personalize
from .rules import AnalysisContext
from .signals import Signal
from .tools import (
    TOOLS,
    fetch_ehr_summary,
    fetch_vitals,
    make_executor,
)

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = load_prompt("smart_recommend.md")


class AnalyzeRequest(BaseModel):
    # Optional in the wire schema because main.py enforces patient scope
    # against the JWT subject before this struct is passed to analyze().
    # The event-driven dispatcher (slice 2) sets it directly — its events
    # carry trusted patient_ids from publishing services, not from a client.
    patient_id: str | None = None
    # Optional trigger context (which event fired analysis). Stored as metadata
    # in the future; ignored today.
    trigger: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class GeneratedRecommendation(BaseModel):
    kind: str
    severity: str
    title: str
    text: str
    evidence: list[str]
    source: str
    dedup_key: str


class AnalyzeResponse(BaseModel):
    patient_id: str
    signal_count: int
    recommendations: list[GeneratedRecommendation] = Field(default_factory=list)


class SmartRecommendAgent(BaseAgent):
    name = "smart_recommend"

    def __init__(self) -> None:
        super().__init__()
        self.provider = make_provider(settings.llm_provider)
        self.memory = make_memory_service_from_env(
            ehr_service_url=settings.ehr_service_url
        )
        self.jwt_secret = settings.jwt_secret
        self.jwt_algorithm = settings.jwt_algorithm
        # Notification dispatcher (disabled when notification_service_url
        # is empty — see config.py). Best-effort; never blocks /analyze.
        self.notifier: NotificationDispatcher = make_notification_dispatcher_from_env(
            notification_service_url=settings.notification_service_url,
            service_token=settings.service_token,
            suppression_seconds=settings.notification_suppression_seconds,
        )
        # Lazily constructed in on_startup so importing the agent in tests
        # doesn't reach for the broker.
        self._subscriber: EventSubscriber | None = None
        self._dispatcher = None  # type: ignore[assignment]  # set in on_startup

    # ── Lifespan: connect the event subscriber ───────────────────────────────

    async def on_startup(self) -> None:
        # Local import to avoid a cycle (dispatcher imports the agent class).
        from .dispatcher import AnalysisDispatcher

        self._dispatcher = AnalysisDispatcher(
            self,
            min_interval_seconds=settings.event_throttle_seconds,
        )
        self._subscriber = EventSubscriber(
            amqp_url=settings.amqp_url or None,
            queue_name=settings.event_queue,
            routing_keys=list(settings.event_routing_keys),
            handler=self._dispatcher.on_event,
        )
        await self._subscriber.start()

    async def on_shutdown(self) -> None:
        if self._subscriber is not None:
            await self._subscriber.stop()
            self._subscriber = None
        self._dispatcher = None

    # ── /analyze path ────────────────────────────────────────────────────────

    async def analyze(self, req: AnalyzeRequest) -> AnalyzeResponse:
        """Pull-mode trigger. Gather context → engine → personalize → persist.

        Callers (main.py /analyze, dispatcher.on_event) are required to set
        req.patient_id before invoking. This is enforced by the type contract
        below — the field is optional on the wire schema, but main.py runs it
        through `enforce_patient_scope` and the dispatcher pulls it from the
        verified event subject.
        """
        if not req.patient_id:
            raise ValueError("analyze() requires req.patient_id; main.py enforces this")
        summary, vitals = await asyncio.gather(
            fetch_ehr_summary(req.patient_id),
            fetch_vitals(req.patient_id),
        )
        ctx = AnalysisContext(
            patient_id=req.patient_id,
            summary=summary,
            vitals=vitals,
        )

        signals = analyze(ctx)
        if not signals:
            return AnalyzeResponse(patient_id=req.patient_id, signal_count=0)

        personalized = await personalize(self.provider, signals)

        # Persist each one. Best-effort: a failed write per recommendation
        # doesn't fail the whole analysis.
        if self.memory is not None:
            await asyncio.gather(
                *(
                    self._persist_recommendation(req.patient_id, p.signal, p.text)
                    for p in personalized
                )
            )

        # Notify the patient on warn/urgent. `info` stays in-app-only and
        # is surfaced when the user opens the feed. Suppression inside the
        # dispatcher prevents the same dedup_key from re-notifying within
        # the configured window.
        await asyncio.gather(
            *(
                self._maybe_notify(req.patient_id, p.signal, p.text)
                for p in personalized
            )
        )

        return AnalyzeResponse(
            patient_id=req.patient_id,
            signal_count=len(signals),
            recommendations=[
                GeneratedRecommendation(
                    kind=p.signal.kind,
                    severity=p.signal.severity,
                    title=p.signal.title,
                    text=p.text,
                    evidence=list(p.signal.evidence),
                    source=p.signal.source,
                    dedup_key=p.signal.dedup_key,
                )
                for p in personalized
            ],
        )

    async def _persist_recommendation(
        self, patient_id: str, signal: Signal, text: str
    ) -> None:
        try:
            await self.memory.write_recommendation(  # type: ignore[union-attr]
                patient_id,
                text=text,
                kind=signal.kind,
                source_agent=self.name,
                evidence=list(signal.evidence),
                dedup_key=signal.dedup_key or None,
            )
        except Exception:
            logger.exception("smart_recommend.persist_failed dedup=%s", signal.dedup_key)

    async def _maybe_notify(
        self, patient_id: str, signal: Signal, text: str
    ) -> None:
        """Fire a notification when severity warrants it. Title comes from
        the signal kind so the patient sees something semantically meaningful
        in the push notification preview before opening the app."""
        title = _notification_title_for(signal)
        try:
            await self.notifier.notify(
                patient_id=patient_id,
                severity=signal.severity,  # type: ignore[arg-type]
                event_type=f"smart_recommend.{signal.kind}.proposed",
                title=title,
                body=text,
                dedup_key=signal.dedup_key or None,
            )
        except Exception:
            # Belt-and-braces — notifier.notify already swallows internally,
            # but if anything escapes here, the analysis must still succeed.
            logger.exception(
                "smart_recommend.notify_failed dedup=%s", signal.dedup_key
            )

    # ── /chat path ───────────────────────────────────────────────────────────

    async def handle(self, req: AgentRequest) -> AgentResponse:
        system_prompt = await self.build_system_prompt(req, _SYSTEM_PROMPT)

        messages = [LLMChatTurn(role=t.role, content=t.content) for t in req.history]
        messages.append(LLMChatTurn(role="user", content=req.message))

        executor = make_executor(
            req.patient_id, list_open=self._list_open_sync
        )

        def _run():
            return self.provider.run(
                system_prompt=system_prompt,
                messages=messages,
                tools=TOOLS,
                executor=executor,
                max_tokens=settings.max_tokens,
            )

        result = await asyncio.to_thread(_run)
        await self.persist_turn(req, result.reply)

        return AgentResponse(
            reply=result.reply,
            tool_calls=result.tool_calls,
            usage=result.usage,
        )

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _list_open_sync(self, patient_id: str):
        """Sync wrapper around the async memory method, for the LLM executor.

        Returns [] if memory isn't configured.
        """
        if self.memory is None:
            return []
        try:
            return asyncio.run(self.memory.list_open_recommendations(patient_id))
        except RuntimeError:
            # We're already inside an event loop (rare here because the LLM
            # provider runs on a worker thread, but be defensive).
            loop = asyncio.new_event_loop()
            try:
                return loop.run_until_complete(
                    self.memory.list_open_recommendations(patient_id)
                )
            finally:
                loop.close()


_TITLE_BY_KIND = {
    "lifestyle": "Lifestyle suggestion",
    "medication": "Medication note",
    "followup": "Follow-up recommended",
    "labs": "Lab follow-up",
    "wellness": "Wellness check-in",
}


def _notification_title_for(signal: Signal) -> str:
    base = _TITLE_BY_KIND.get(signal.kind, "Health note")
    if signal.severity == "urgent":
        return f"Important: {base.lower()}"
    return base
