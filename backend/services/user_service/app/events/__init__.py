"""Event publishing for user_service.

A single `EventBus` instance is created at startup and held on the FastAPI
`app.state`. `publish()` is a thin wrapper that swallows publish failures
(events should never block a 200 response) and logs them — the consumer-side
retry / DLQ handles durability.

In tests / dev where rabbit isn't running, `settings.publish_events=False`
disables the bus entirely.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI

from shared.events import DomainEvent, EventBus
from shared.observability import get_logger

from ..config import settings

log = get_logger(__name__)

_SOURCE = "user-service"


async def init_bus(app: FastAPI) -> EventBus | None:
    if not settings.publish_events:
        log.info("event_bus.disabled")
        app.state.event_bus = None
        return None
    bus = EventBus(settings.rabbitmq_url)
    try:
        await bus.connect()
    except Exception as exc:  # noqa: BLE001
        log.warning("event_bus.connect_failed", error=str(exc))
        # KEEP the bus rather than storing None. EventBus._ensure_connected
        # retries on the first publish, so a service that boots before RabbitMQ
        # recovers by itself instead of staying silent for its whole lifetime.
        app.state.event_bus = bus
        return bus
    app.state.event_bus = bus
    return bus


async def close_bus(app: FastAPI) -> None:
    bus: EventBus | None = getattr(app.state, "event_bus", None)
    if bus:
        await bus.close()


async def publish(app: FastAPI, *, event_type: str, subject: str, data: dict[str, Any]) -> None:
    bus: EventBus | None = getattr(app.state, "event_bus", None)
    if not bus:
        return
    try:
        await bus.publish(
            DomainEvent(type=event_type, source=_SOURCE, subject=subject, data=data),
            routing_key=event_type,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("event_bus.publish_failed", event=event_type, error=str(exc))


__all__ = ["init_bus", "close_bus", "publish"]
