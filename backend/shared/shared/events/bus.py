"""RabbitMQ topic-exchange event bus with DLQ + retry capping.

Audit finding B-19: failed handlers used to silently drop the message
(default `async with message.process()` requeues on exception, leading
to infinite retry on a poison-pill payload). This module now:

  1. Declares each subscriber's queue with a dead-letter exchange (DLX)
     pointing at a per-queue DLQ.
  2. Counts redeliveries via the `x-death` header that RabbitMQ adds
     when a message is requeued.
  3. After `max_retries` attempts, rejects without requeue — the message
     routes to the DLQ via the DLX. Operators can inspect, fix, and
     replay from the DLQ separately.

The exchange name and routing-key convention are unchanged
(`medapp.events` topic + `routing_key == event.type`).
"""

from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable

import aio_pika

from .schema import DomainEvent

logger = logging.getLogger(__name__)

Handler = Callable[[DomainEvent], Awaitable[None]]

# When a message is nacked-no-requeue, RabbitMQ routes it via the configured
# dead-letter exchange. We use one DLX for the whole platform; each
# subscriber's main queue points at it, and a per-queue DLQ binds to the
# DLX for inspection / replay.
DEFAULT_DLX = "medapp.events.dlx"
DEFAULT_MAX_RETRIES = 3


class EventBus:
    def __init__(
        self,
        amqp_url: str,
        exchange_name: str = "medapp.events",
        dlx_name: str = DEFAULT_DLX,
        max_retries: int = DEFAULT_MAX_RETRIES,
    ) -> None:
        self._amqp_url = amqp_url
        self._exchange_name = exchange_name
        self._dlx_name = dlx_name
        self._max_retries = max_retries
        self._connection: aio_pika.RobustConnection | None = None
        self._exchange: aio_pika.abc.AbstractExchange | None = None
        self._dlx: aio_pika.abc.AbstractExchange | None = None

    async def connect(self) -> None:
        self._connection = await aio_pika.connect_robust(self._amqp_url)
        channel = await self._connection.channel()
        self._exchange = await channel.declare_exchange(
            self._exchange_name, aio_pika.ExchangeType.TOPIC, durable=True
        )
        # The DLX is fanout — every dead-lettered message goes to whatever
        # queues bind to it. Per-subscriber DLQs bind with the original
        # routing key so operators can correlate.
        self._dlx = await channel.declare_exchange(
            self._dlx_name, aio_pika.ExchangeType.FANOUT, durable=True
        )

    async def _ensure_connected(self) -> None:
        """Connect if we never did, or if the connection has since closed.

        `aio_pika.connect_robust` recovers a connection it has ALREADY made, so
        it handles a broker bounce on its own. What it cannot do is recover from
        a connect that never succeeded — and that was the real hole: a service
        booting before RabbitMQ took the failure once, its caller stored `None`,
        and `publish()` was a silent no-op for the life of the process.

        This makes the first successful publish do the connecting. Cheap: after
        the first call `_exchange` is set and this is two attribute reads.
        """
        if self._exchange is not None and self._connection is not None and not self._connection.is_closed:
            return
        await self.connect()

    async def publish(self, event: DomainEvent, routing_key: str | None = None) -> None:
        # NOT an assert. Asserting "not connected" turns a recoverable broker
        # blip into a 500 on whatever request happened to be publishing, and
        # asserts vanish under -O.
        await self._ensure_connected()
        assert self._exchange is not None, "EventBus not connected"
        body = event.model_dump_json().encode()
        await self._exchange.publish(
            aio_pika.Message(body=body, content_type="application/json"),
            routing_key=routing_key or event.type,
        )

    async def subscribe(
        self,
        queue_name: str,
        routing_keys: list[str],
        handler: Handler,
        *,
        max_retries: int | None = None,
    ) -> None:
        """Bind a subscriber to one or more routing keys.

        Sets up the main queue with DLX routing AND a paired DLQ named
        `<queue_name>.dlq`. After `max_retries` (default 3) handler
        failures, the message routes to the DLQ — operators replay or
        delete from there.
        """
        assert self._connection is not None and self._exchange is not None
        retries = max_retries if max_retries is not None else self._max_retries
        channel = await self._connection.channel()

        # Main queue: failures route to the DLX via x-dead-letter-exchange.
        # Bind it to the topic exchange for the requested routing keys.
        queue = await channel.declare_queue(
            queue_name,
            durable=True,
            arguments={"x-dead-letter-exchange": self._dlx_name},
        )
        for key in routing_keys:
            await queue.bind(self._exchange, routing_key=key)

        # DLQ: durable queue bound to the DLX so dead-lettered messages
        # are queryable post-hoc. Same name as the source queue + ".dlq".
        dlq_name = f"{queue_name}.dlq"
        dlq = await channel.declare_queue(dlq_name, durable=True)
        await dlq.bind(self._dlx, routing_key=queue_name)

        async def _on_message(message: aio_pika.abc.AbstractIncomingMessage) -> None:
            attempt = _count_redeliveries(message) + 1
            try:
                payload = json.loads(message.body)
                event = DomainEvent.model_validate(payload)
                await handler(event)
                # Success — ack so the message is removed from the queue.
                await message.ack()
            except Exception:
                logger.exception(
                    "event_handler_failed queue=%s attempt=%s/%s event_id=%s",
                    queue_name,
                    attempt,
                    retries,
                    _maybe_event_id(message),
                )
                if attempt >= retries:
                    # Done — reject without requeue so the DLX takes it to
                    # the DLQ for human review.
                    logger.error(
                        "event_dlq_routed queue=%s attempts=%s event_id=%s",
                        queue_name,
                        attempt,
                        _maybe_event_id(message),
                    )
                    await message.reject(requeue=False)
                else:
                    # Requeue to retry. RabbitMQ adds an entry to x-death
                    # on the next delivery; we read it on the next loop.
                    await message.reject(requeue=True)

        await queue.consume(_on_message)

    async def close(self) -> None:
        if self._connection:
            await self._connection.close()


# ── Helpers ─────────────────────────────────────────────────────────────────


def _count_redeliveries(message: aio_pika.abc.AbstractIncomingMessage) -> int:
    """Count prior delivery attempts from the x-death header.

    RabbitMQ adds an `x-death` array to the headers each time a message
    is dead-lettered (which includes nack-without-requeue and TTL
    expiry). The first entry's `count` is the total redelivery count
    for the queue. Returns 0 for first-time deliveries.
    """
    headers = message.headers or {}
    x_death = headers.get("x-death")
    if not isinstance(x_death, list) or not x_death:
        # Fallback to aio_pika's redelivered flag — true if the broker
        # marked the message as redelivered. Coarser but still useful.
        return 1 if message.redelivered else 0
    first = x_death[0]
    if isinstance(first, dict):
        count = first.get("count")
        if isinstance(count, int):
            return count
    return 0


def _maybe_event_id(message: aio_pika.abc.AbstractIncomingMessage) -> str | None:
    """Best-effort extraction of the event_id for log correlation. Returns
    None if the payload isn't parseable as JSON — we don't want logging
    to itself throw."""
    try:
        payload = json.loads(message.body)
        return str(payload.get("id"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None


__all__ = ["DEFAULT_DLX", "DEFAULT_MAX_RETRIES", "EventBus", "Handler"]
