"""Vitals Watcher agent.

Two execution paths:

  /chat (synchronous, LLM-driven):
      Patient/operator asks something like "any anomalies in my heart rate
      today?". The LLM may call `get_recent_anomalies` which re-scans the
      EHR vitals timeline through the same detectors used by the push path.

  /event subscriber (push, no LLM):
      Subscribes to `wearable.vitals.uploaded`. On each event:
        1. Throttle per-patient (60s default — acute lane).
        2. Pull last 6h of vitals from EHR.
        3. Run detectors over each sample.
        4. If anything fires, publish `vitals.anomaly.detected` so
           downstream agents (smart_recommend, notification_service) can
           act.

The push path is **silent on healthy reads** — empty anomaly lists are
not published. Quiet bus = no problems found.
"""
from __future__ import annotations

import asyncio
import logging

from agents.shared import (
    AgentRequest,
    AgentResponse,
    BaseAgent,
    EventPublisher,
    EventSubscriber,
    LLMChatTurn,
    NotificationDispatcher,
    load_prompt,
    make_memory_service_from_env,
    make_notification_dispatcher_from_env,
    make_provider,
)

from .config import settings
from .tools import TOOLS, fetch_vitals, make_executor

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = load_prompt("vitals_watcher.md")


class VitalsWatcherAgent(BaseAgent):
    name = "vitals_watcher"

    def __init__(self) -> None:
        super().__init__()
        self.provider = make_provider(settings.llm_provider)
        self.memory = make_memory_service_from_env(
            ehr_service_url=settings.ehr_service_url
        )
        self.jwt_secret = settings.jwt_secret
        self.jwt_algorithm = settings.jwt_algorithm
        # Notification dispatcher (disabled when notification_service_url is
        # empty). Used by the anomaly dispatcher to push alerts to the patient
        # on warning/critical detections.
        self.notifier: NotificationDispatcher = make_notification_dispatcher_from_env(
            notification_service_url=settings.notification_service_url,
            service_token=settings.service_token,
            suppression_seconds=settings.notification_suppression_seconds,
        )
        # Lazily constructed in on_startup so import-time tests don't reach
        # for the broker.
        self._subscriber: EventSubscriber | None = None
        self._publisher: EventPublisher | None = None
        self._dispatcher = None  # type: ignore[assignment]

    # ── Lifespan: subscribe to upload events; open the publisher ─────────────

    async def on_startup(self) -> None:
        # Local import to avoid a cycle (dispatcher imports agent module
        # for type-hinting via the function callable contract).
        from .dispatcher import AnomalyDispatcher

        amqp = settings.amqp_url or None
        self._publisher = EventPublisher(
            amqp_url=amqp,
            source="vitals-watcher-agent",
        )
        await self._publisher.start()

        self._dispatcher = AnomalyDispatcher(
            fetch_vitals=fetch_vitals,
            publish=self._publisher.publish,
            notify=self.notifier.notify,
            min_interval_seconds=settings.event_throttle_seconds,
            scan_hours_back=settings.scan_hours_back,
        )
        self._subscriber = EventSubscriber(
            amqp_url=amqp,
            queue_name=settings.event_queue,
            routing_keys=list(settings.event_routing_keys),
            handler=self._dispatcher.on_event,
        )
        await self._subscriber.start()

    async def on_shutdown(self) -> None:
        if self._subscriber is not None:
            await self._subscriber.stop()
            self._subscriber = None
        if self._publisher is not None:
            await self._publisher.stop()
            self._publisher = None
        self._dispatcher = None

    # ── /chat path ───────────────────────────────────────────────────────────

    async def handle(self, req: AgentRequest) -> AgentResponse:
        system_prompt = await self.build_system_prompt(req, _SYSTEM_PROMPT)

        messages = [LLMChatTurn(role=t.role, content=t.content) for t in req.history]
        messages.append(LLMChatTurn(role="user", content=req.message))

        # By the time we reach handle(), make_app has resolved patient_id
        # against the verified JWT subject (audit finding #4 fix).
        assert req.patient_id is not None, "make_app must populate patient_id"
        executor = make_executor(req.patient_id)

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
