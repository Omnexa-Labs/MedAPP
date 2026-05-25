"""Event publishing for ehr_service.

Pattern matches `backend/services/wearable_sync_service/app/events/__init__.py`
and `backend/services/user_service/app/events/__init__.py` — single bus on
`app.state.event_bus`, swallowed failures, disabled when
`publish_events=False`.

Routing keys published:

  - `ehr.vital.recorded` — after a vital row is persisted via
    `POST /v1/patients/{patient_id}/vitals`. Subject is the patient_id.
    `data` carries the vital_id, kind, value, unit, recorded_at.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI

from shared.events import DomainEvent, EventBus

from ..config import settings

log = logging.getLogger(__name__)

_SOURCE = "ehr-service"


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
        app.state.event_bus = None
        return None
    app.state.event_bus = bus
    log.info("event_bus.connected service=%s", _SOURCE)
    return bus


async def close_bus(app: FastAPI) -> None:
    bus: EventBus | None = getattr(app.state, "event_bus", None)
    if bus:
        await bus.close()


async def publish(
    app: FastAPI,
    *,
    event_type: str,
    subject: str,
    data: dict[str, Any],
) -> None:
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


__all__ = ["init_bus", "close_bus", "publish"]
