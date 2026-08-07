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

import asyncio
import logging
from contextlib import suppress
from typing import Any

from fastapi import FastAPI
from sqlalchemy import update

from shared.events import DomainEvent, EventBus

from ..config import settings
from ..db import SessionLocal
from ..models import PostComment, SocialPost

log = logging.getLogger(__name__)

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


async def _subscribe_with_retry(app: FastAPI) -> None:
    """Keep trying to subscribe until it takes.

    The publisher side self-heals through `EventBus._ensure_connected` — every
    `publish()` is a fresh chance to connect. A SUBSCRIBER has no such
    opportunity: it connects once at startup and then only ever receives, so a
    single failed attempt used to mean silence for the life of the process,
    with nothing to signal it. Compose now orders startup, but compose ordering
    does not exist in Kubernetes and does nothing for a broker that dies before
    this service's first attempt.

    Backoff caps at 30s rather than growing without bound: a broker that comes
    back after an hour should be picked up within the minute, not eventually.

    Cancelled on shutdown by `close_consumer`. `asyncio.CancelledError` is
    re-raised rather than swallowed — swallowing it makes shutdown hang.

    WHEN A SECOND CONSUMER APPEARS, this belongs in `shared/events` next to the
    bus. It lives here while social_service is the only subscriber in the
    codebase; copying it into a second service would be the moment to move it.
    """
    delay = 1.0
    attempt = 0
    while True:
        attempt += 1
        try:
            bus = EventBus(settings.rabbitmq_url)
            await bus.connect()
            await bus.subscribe(_QUEUE, _ROUTING_KEYS, _on_profile_updated)
            app.state.event_bus = bus
            log.info("subscribed to %s after %d attempt(s)", _ROUTING_KEYS, attempt)
            return
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - a broker outage must not stop the API
            log.warning(
                "subscribe attempt %d failed; retrying in %.0fs (names will be stale until then)",
                attempt,
                delay,
                exc_info=attempt == 1,
            )
            await asyncio.sleep(delay)
            delay = min(delay * 2, 30.0)


async def init_consumer(app: FastAPI) -> None:
    """Start subscribing in the BACKGROUND. Never blocks startup.

    Awaiting the subscription here would couple the API's readiness to the
    broker: with the retry loop in front, a down broker would hold the whole
    service in startup instead of serving the feed, which reads from Postgres
    and does not need RabbitMQ at all.
    """
    if not getattr(settings, "consume_events", True):
        return
    app.state.event_bus = None
    app.state.subscriber_task = asyncio.create_task(_subscribe_with_retry(app))


async def close_consumer(app: FastAPI) -> None:
    task = getattr(app.state, "subscriber_task", None)
    if task is not None and not task.done():
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
    bus = getattr(app.state, "event_bus", None)
    if bus is not None:
        try:
            await bus.close()
        except Exception:  # noqa: BLE001
            log.warning("event bus close failed", exc_info=True)
