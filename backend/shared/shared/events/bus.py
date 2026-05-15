from __future__ import annotations

import json
from collections.abc import Awaitable, Callable

import aio_pika

from .schema import DomainEvent

Handler = Callable[[DomainEvent], Awaitable[None]]


class EventBus:
    def __init__(self, amqp_url: str, exchange_name: str = "medapp.events") -> None:
        self._amqp_url = amqp_url
        self._exchange_name = exchange_name
        self._connection: aio_pika.RobustConnection | None = None
        self._exchange: aio_pika.abc.AbstractExchange | None = None

    async def connect(self) -> None:
        self._connection = await aio_pika.connect_robust(self._amqp_url)
        channel = await self._connection.channel()
        self._exchange = await channel.declare_exchange(
            self._exchange_name, aio_pika.ExchangeType.TOPIC, durable=True
        )

    async def publish(self, event: DomainEvent, routing_key: str | None = None) -> None:
        assert self._exchange is not None, "EventBus not connected"
        body = event.model_dump_json().encode()
        await self._exchange.publish(
            aio_pika.Message(body=body, content_type="application/json"),
            routing_key=routing_key or event.type,
        )

    async def subscribe(self, queue_name: str, routing_keys: list[str], handler: Handler) -> None:
        assert self._connection is not None and self._exchange is not None
        channel = await self._connection.channel()
        queue = await channel.declare_queue(queue_name, durable=True)
        for key in routing_keys:
            await queue.bind(self._exchange, routing_key=key)

        async def _on_message(message: aio_pika.abc.AbstractIncomingMessage) -> None:
            async with message.process():
                payload = json.loads(message.body)
                await handler(DomainEvent.model_validate(payload))

        await queue.consume(_on_message)

    async def close(self) -> None:
        if self._connection:
            await self._connection.close()
