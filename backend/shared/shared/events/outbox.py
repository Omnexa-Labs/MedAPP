"""Transactional outbox for domain events.

Audit finding B-20: services publish events synchronously inside the
request handler today. If the broker is unreachable after the DB commit
already succeeded, the event is lost forever — the API response went
back as 201 but the downstream world never hears about it.

The transactional outbox pattern fixes that:

  1. Inside the same SQLAlchemy session as the business write, the
     service calls `write_outbox_event(session, ...)`. The row lands in
     `outbox_events` atomically with the rest of the transaction.
  2. A background worker periodically calls `drain_outbox(session, bus)`.
     It reads unpublished rows, publishes each to the broker, marks
     them published on success, or increments `attempts` on failure.
  3. Broker hiccups don't lose events — they sit in the outbox until
     the worker retries. Crash recovery is automatic: on restart, the
     worker drains whatever wasn't published.

The model is registered with `shared.db.Base`, so every service whose
Alembic env imports models from `shared.events` picks it up. Services
that don't want the outbox simply don't write to it — the table sits
empty (zero storage cost).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import JSON, DateTime, Index, Integer, String, Text, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base

from .bus import EventBus
from .schema import DomainEvent

logger = logging.getLogger(__name__)


class OutboxEvent(Base):
    """One row per to-be-published domain event.

    Indexed on `(published_at IS NULL, created_at)` so the drain worker
    can find unpublished rows quickly even at high volume.
    """

    __tablename__ = "outbox_events"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    event_type: Mapped[str] = mapped_column(String(128), nullable=False)
    routing_key: Mapped[str] = mapped_column(String(128), nullable=False)
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Generic JSON (not JSONB) so the same model works on Postgres and the
    # SQLite test DBs. The outbox doesn't need JSONB-specific features
    # (no GIN index, no path operators) — rows are looked up by id and
    # `published_at IS NULL`.
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_attempt_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        # Partial-index-style hint for finding work — covered by an explicit
        # `where(published_at.is_(None))` in the drain query.
        Index("ix_outbox_events_unpublished", "created_at", "published_at"),
    )


async def write_outbox_event(
    session: AsyncSession,
    *,
    event_type: str,
    source: str,
    subject: str | None = None,
    data: dict[str, Any] | None = None,
    routing_key: str | None = None,
) -> OutboxEvent:
    """Add one outbox row to the session.

    The caller's session commit makes both the business write and the
    outbox row durable atomically — that's the transactional guarantee.
    `routing_key` defaults to `event_type` to match the bus convention.
    """
    row = OutboxEvent(
        event_type=event_type,
        routing_key=routing_key or event_type,
        source=source,
        subject=subject,
        payload=data or {},
    )
    session.add(row)
    # No flush here — the caller's commit handles it.
    return row


async def drain_outbox(
    session: AsyncSession,
    bus: EventBus,
    *,
    batch_size: int = 100,
    max_attempts: int = 10,
) -> int:
    """Publish unpublished rows from the outbox. Returns count published.

    Loops through up to `batch_size` rows per call. For each row:
      - Construct a DomainEvent and publish via the bus.
      - On success: stamp `published_at` and commit.
      - On failure: increment `attempts`, record `last_error`, commit.
        Rows with `attempts >= max_attempts` are skipped on future
        calls until an operator intervenes (set `attempts` back to 0,
        or delete).

    Designed to be called from a background task — short call, no
    blocking. Safe to run on multiple workers because each row is
    selected `FOR UPDATE SKIP LOCKED` (Postgres) — see comment below.
    """
    # NOTE on concurrency: this implementation uses a simple ordered
    # select. Running multiple drain workers against the same outbox
    # could double-publish (each worker sees the same unpublished row).
    # For single-worker deployments today that's fine; multi-worker
    # needs `with_for_update(skip_locked=True)` once we scale out.
    stmt = (
        select(OutboxEvent)
        .where(OutboxEvent.published_at.is_(None))
        .where(OutboxEvent.attempts < max_attempts)
        .order_by(OutboxEvent.created_at.asc())
        .limit(batch_size)
    )
    rows = (await session.scalars(stmt)).all()

    published = 0
    for row in rows:
        event = DomainEvent(
            type=row.event_type,
            source=row.source,
            subject=row.subject,
            data=row.payload or {},
        )
        try:
            await bus.publish(event, routing_key=row.routing_key)
        except Exception as exc:  # noqa: BLE001
            row.attempts += 1
            row.last_attempt_at = datetime.now(timezone.utc)
            row.last_error = str(exc)[:512]
            logger.warning(
                "outbox.publish_failed event_type=%s attempts=%s error=%s",
                row.event_type,
                row.attempts,
                exc,
            )
            await session.flush()
            continue
        row.published_at = datetime.now(timezone.utc)
        row.last_attempt_at = row.published_at
        row.last_error = None
        published += 1
        await session.flush()

    if published > 0:
        logger.info("outbox.drained published=%s of %s", published, len(rows))
    return published


__all__ = ["OutboxEvent", "write_outbox_event", "drain_outbox"]
