"""Event consumption for social_service — the FIRST consumer in this codebase.

Every other service publishes; nothing subscribed until now. `EventBus.subscribe`
already provisions a DLQ (`<queue>.dlq`) after `max_retries` handler failures, so
a poisoned message parks rather than spinning.

WHY THIS EXISTS
---------------
`SocialPost.author_name` and `PostComment.author_name` are snapshots taken at
write time. That is the right read-path design — identity lives in user_service
and a join would be an N+1 across the network on every feed paint — but its
failure mode is a stale name, and a stale name here is not cosmetic: someone who
marries, corrects a misspelling, or transitions would otherwise keep their old
name on everything they ever wrote. Deadnaming a patient in a health app is a
harm, not a stale cache.

ANONYMOUS POSTS ARE NOT TOUCHED. An anonymous post has `author_name IS NULL` by
construction, and the UPDATE is scoped to rows that already hold a name. Writing
one here would deanonymise the author through the back door of a rename — the
exact leak `create_post` avoids by never storing it in the first place.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI
from sqlalchemy import update

from shared.events import DomainEvent, EventBus

from ..config import settings
from ..db import SessionLocal
from ..models import PostComment, SocialPost

log = logging.getLogger(__name__)

_SOURCE = "social-service"
_QUEUE = "social_service.user_profile"
_ROUTING_KEYS = ["user.profile.updated"]


async def _on_profile_updated(event: DomainEvent) -> None:
    data: dict[str, Any] = event.data or {}
    user_id = data.get("user_id")
    display_name = (data.get("display_name") or "").strip()
    if not user_id or not display_name:
        log.warning("user.profile.updated missing user_id or display_name; ignoring")
        return

    async with SessionLocal() as db:
        for model in (SocialPost, PostComment):
            await db.execute(
                update(model)
                .where(model.author_user_id == user_id)
                # NOT NULL only — see the module docstring on anonymity.
                .where(model.author_name.is_not(None))
                .values(author_name=display_name)
            )
        await db.commit()
    log.info("refreshed author_name snapshots for %s", user_id)


async def init_consumer(app: FastAPI) -> None:
    """Subscribe on startup. Never fatal: the feed must serve if RabbitMQ is down."""
    if not getattr(settings, "consume_events", True):
        return
    try:
        bus = EventBus(source=_SOURCE)
        await bus.connect()
        await bus.subscribe(_QUEUE, _ROUTING_KEYS, _on_profile_updated)
        app.state.event_bus = bus
    except Exception:  # noqa: BLE001 - a broker outage must not stop the API
        log.warning("could not subscribe to %s; names will go stale", _ROUTING_KEYS, exc_info=True)


async def close_consumer(app: FastAPI) -> None:
    bus = getattr(app.state, "event_bus", None)
    if bus is not None:
        try:
            await bus.close()
        except Exception:  # noqa: BLE001
            log.warning("event bus close failed", exc_info=True)
