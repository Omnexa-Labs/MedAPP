"""Domain events + RabbitMQ consumer for the agent layer.

The wire format mirrors `backend/shared/shared/events/schema.py` exactly —
same field names, same types — so events published by user_service / lab /
wearable_sync deserialise here without translation. Agents are a separate
uv project, so we duplicate the *schema* (a contract, not code).

Two pieces live here:

- `DomainEvent` — the CloudEvents-shaped Pydantic model.
- `EventSubscriber` — a thin aio-pika consumer that runs as a background
  asyncio task in the FastAPI lifespan. When the AMQP URL is unset the
  subscriber is a no-op; agents still serve their HTTP routes.

`aio-pika` is loaded lazily — it's an optional extra (`agents[events]`).
Tests don't need it; they use `FakeEventBus`.
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, ValidationError

logger = logging.getLogger(__name__)


# ── Wire schema (compatible with backend/shared/shared/events/schema.py) ────


class DomainEvent(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    type: str
    source: str
    subject: str | None = None
    time: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    data: dict[str, Any] = Field(default_factory=dict)
    specversion: str = "1.0"


EventHandler = Callable[[DomainEvent], Awaitable[None]]


# ── Real RabbitMQ subscriber ────────────────────────────────────────────────


class EventSubscriber:
    """aio-pika-backed topic subscriber.

    Lifecycle: `await start()` kicks off a background task that connects and
    consumes; `await stop()` cancels and closes cleanly. Both are idempotent
    and safe to call when the subscriber is disabled.

    Disabled when `amqp_url` is None or empty — agents that don't need
    events should leave the env var unset, and pull-mode keeps working.
    """

    def __init__(
        self,
        *,
        amqp_url: str | None,
        queue_name: str,
        routing_keys: list[str],
        handler: EventHandler,
        exchange_name: str = "medapp.events",
        prefetch: int = 8,
    ) -> None:
        self._amqp_url = amqp_url
        self._queue_name = queue_name
        self._routing_keys = list(routing_keys)
        self._handler = handler
        self._exchange_name = exchange_name
        self._prefetch = prefetch
        self._task: asyncio.Task[None] | None = None
        self._connection: Any = None  # aio_pika.RobustConnection; typed Any to avoid import at top

    @property
    def enabled(self) -> bool:
        return bool(self._amqp_url)

    async def start(self) -> None:
        if not self.enabled:
            logger.info(
                "event_subscriber.disabled reason=no_amqp_url queue=%s",
                self._queue_name,
            )
            return
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._run(), name=f"events:{self._queue_name}")

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None
        if self._connection is not None:
            try:
                await self._connection.close()
            except Exception:
                logger.exception("event_subscriber.close_failed queue=%s", self._queue_name)
            self._connection = None

    async def _run(self) -> None:
        try:
            try:
                import aio_pika
                from aio_pika import ExchangeType
            except ImportError as e:
                logger.error(
                    "event_subscriber.aio_pika_missing queue=%s install=agents[events] err=%s",
                    self._queue_name,
                    e,
                )
                return

            self._connection = await aio_pika.connect_robust(self._amqp_url)
            channel = await self._connection.channel()
            await channel.set_qos(prefetch_count=self._prefetch)
            exchange = await channel.declare_exchange(
                self._exchange_name, ExchangeType.TOPIC, durable=True
            )
            queue = await channel.declare_queue(self._queue_name, durable=True)
            for key in self._routing_keys:
                await queue.bind(exchange, routing_key=key)
            logger.info(
                "event_subscriber.bound queue=%s keys=%s",
                self._queue_name,
                self._routing_keys,
            )
            await queue.consume(self._on_message)
            # Park here until cancelled. aio-pika delivers messages via the
            # callback registered above on its own channel task.
            await asyncio.Future()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("event_subscriber.crashed queue=%s", self._queue_name)

    async def _on_message(self, message: Any) -> None:
        # aio_pika.abc.AbstractIncomingMessage — typed Any to avoid the import
        # at module load time.
        async with message.process(ignore_processed=True):
            event = _parse_event(message.body, routing_key=message.routing_key)
            if event is None:
                return  # bad payload; ack and drop
            try:
                await self._handler(event)
            except Exception:
                logger.exception(
                    "event_subscriber.handler_failed event_id=%s type=%s",
                    event.id,
                    event.type,
                )


def _parse_event(body: bytes, *, routing_key: str | None) -> DomainEvent | None:
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        logger.warning("event_subscriber.bad_json routing_key=%s", routing_key)
        return None
    try:
        return DomainEvent.model_validate(payload)
    except ValidationError as e:
        logger.warning(
            "event_subscriber.schema_invalid routing_key=%s errors=%s",
            routing_key,
            e.errors()[:3],
        )
        return None


# ── Test double ─────────────────────────────────────────────────────────────


class EventPublisher:
    """aio-pika-backed topic publisher.

    Mirrors the publisher pattern used by `user_service` and
    `wearable_sync_service`: connect once on startup, swallow publish
    failures (events are best-effort — never block a 200 response), close
    on shutdown.

    Disabled when `amqp_url` is None or empty. `publish()` becomes a no-op
    so agents can run in pull-mode without a broker. The lazy aio-pika
    import means unit tests don't need the `events` extra installed.
    """

    def __init__(
        self,
        *,
        amqp_url: str | None,
        source: str,
        exchange_name: str = "medapp.events",
    ) -> None:
        self._amqp_url = amqp_url
        self._source = source
        self._exchange_name = exchange_name
        self._connection: Any = None
        self._exchange: Any = None

    @property
    def enabled(self) -> bool:
        return bool(self._amqp_url)

    async def start(self) -> None:
        if not self.enabled:
            logger.info("event_publisher.disabled source=%s", self._source)
            return
        try:
            import aio_pika
            from aio_pika import ExchangeType
        except ImportError as e:
            logger.error(
                "event_publisher.aio_pika_missing source=%s install=agents[events] err=%s",
                self._source,
                e,
            )
            return
        try:
            self._connection = await aio_pika.connect_robust(self._amqp_url)
            channel = await self._connection.channel()
            self._exchange = await channel.declare_exchange(
                self._exchange_name, ExchangeType.TOPIC, durable=True
            )
            logger.info("event_publisher.connected source=%s", self._source)
        except Exception:
            logger.exception("event_publisher.connect_failed source=%s", self._source)
            self._connection = None
            self._exchange = None

    async def stop(self) -> None:
        if self._connection is not None:
            try:
                await self._connection.close()
            except Exception:
                logger.exception("event_publisher.close_failed source=%s", self._source)
            self._connection = None
            self._exchange = None

    async def publish(
        self,
        *,
        event_type: str,
        subject: str,
        data: dict[str, Any],
    ) -> None:
        """Build a DomainEvent and publish it. Failures are logged, not raised.

        The contract matches `backend/services/*/app/events/publish` — events
        are best-effort; durability is on the consumer side (retry / DLQ).
        """
        if self._exchange is None:
            # Either disabled or connect failed. Silent — already logged.
            return
        try:
            import aio_pika
        except ImportError:
            return
        event = DomainEvent(type=event_type, source=self._source, subject=subject, data=data)
        try:
            await self._exchange.publish(
                aio_pika.Message(
                    body=event.model_dump_json().encode(),
                    content_type="application/json",
                ),
                routing_key=event_type,
            )
        except Exception:
            logger.exception(
                "event_publisher.publish_failed source=%s type=%s",
                self._source,
                event_type,
            )


class FakeEventBus:
    """In-memory pub/sub for unit tests.

    No broker, no aio-pika. Tests call `await bus.publish(event)` and the
    matching handler runs synchronously in the same event loop. Routing
    matches by exact key (no wildcards — keep tests obvious).
    """

    def __init__(self) -> None:
        self._handlers: dict[str, list[EventHandler]] = {}

    def subscribe(self, routing_key: str, handler: EventHandler) -> None:
        self._handlers.setdefault(routing_key, []).append(handler)

    async def publish(self, event: DomainEvent) -> None:
        for handler in self._handlers.get(event.type, []):
            try:
                await handler(event)
            except Exception:
                logger.exception("fake_event_bus.handler_failed type=%s", event.type)
