"""Event publishing for wearable_sync_service.

Two publishing paths:

  1. `enqueue_outbox(session, ...)` — writes a row to the outbox table in
     the caller's session. The next `drain_outbox()` call publishes to
     RabbitMQ. **This is the path routes should use** (audit finding
     B-20) — a broker hiccup never loses an event because the outbox
     row is committed atomically with the business write.

  2. `publish(app, ...)` — direct publish, retained for the rare case
     where atomicity with a DB write isn't required (and the caller is
     OK with the event being lost if rabbit is down). New code should
     prefer `enqueue_outbox`.

The background drain task runs in the FastAPI lifespan — see `main.py`.

Routing keys published by this service:
  - `wearable.vitals.uploaded` after `/v1/wearables/sync`

The shared `EventBus` configures DLX + retry-capping per audit finding
B-19; handler failures route to a `<queue>.dlq` after 3 attempts.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession

from shared.events import DomainEvent, EventBus, write_outbox_event

from ..config import settings

log = logging.getLogger(__name__)

_SOURCE = "wearable-sync-service"


async def init_bus(app: FastAPI) -> EventBus | None:
    if not settings.publish_events:
        log.info("event_bus.disabled service=%s", _SOURCE)
        app.state.event_bus = None
        return None
    bus = EventBus(settings.rabbitmq_url)
    try:
        await bus.connect()
    except Exception as exc:  # noqa: BLE001
        log.warning("event_bus.connect_failed service=%s error=%s", _SOURCE, exc)
        # KEEP the bus rather than storing None. The connection is retried on
        # the first publish (EventBus._ensure_connected), so a service that
        # boots before RabbitMQ recovers by itself instead of staying silent
        # until someone restarts it.
        app.state.event_bus = bus
        return bus
    app.state.event_bus = bus
    log.info("event_bus.connected service=%s", _SOURCE)
    return bus


async def close_bus(app: FastAPI) -> None:
    bus: EventBus | None = getattr(app.state, "event_bus", None)
    if bus:
        await bus.close()


async def enqueue_outbox(
    session: AsyncSession,
    *,
    event_type: str,
    subject: str,
    data: dict[str, Any],
) -> None:
    """Write a domain event to the outbox table.

    Called inside the same DB session as the business write. The drain
    worker (started in `main.py` lifespan) publishes it to RabbitMQ
    later — usually within a few seconds, but guaranteed eventually as
    long as Postgres has the row.
    """
    await write_outbox_event(
        session,
        event_type=event_type,
        source=_SOURCE,
        subject=subject,
        data=data,
    )


async def publish(
    app: FastAPI,
    *,
    event_type: str,
    subject: str,
    data: dict[str, Any],
) -> None:
    """Direct publish path. Kept for backwards compat; new callers should
    use `enqueue_outbox` so a broker failure doesn't lose the event.

    Swallows publish failures (events should never block a 200 response).
    """
    bus: EventBus | None = getattr(app.state, "event_bus", None)
    if not bus:
        return
    try:
        await bus.publish(
            DomainEvent(type=event_type, source=_SOURCE, subject=subject, data=data),
            routing_key=event_type,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("event_bus.publish_failed event=%s error=%s", event_type, exc)


__all__ = ["init_bus", "close_bus", "publish", "enqueue_outbox"]
