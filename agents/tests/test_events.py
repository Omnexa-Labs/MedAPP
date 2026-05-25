"""Shared-events module tests.

Covers:
  - DomainEvent schema round-trip + wire compatibility with the backend.
  - EventSubscriber.start() is a no-op when amqp_url is unset.
  - EventSubscriber.stop() is safe to call without start().
  - FakeEventBus pub/sub fan-out for testing dispatchers.
  - Bad payloads are dropped (not raised) by the message parser.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from agents.shared.events import DomainEvent, EventSubscriber, FakeEventBus, _parse_event


# ── DomainEvent schema ───────────────────────────────────────────────────────


def test_domain_event_round_trips() -> None:
    e = DomainEvent(
        type="wearable.vitals.uploaded",
        source="wearable-sync-service",
        subject="patient-123",
        data={"vital_count": 4},
    )
    raw = e.model_dump_json()
    back = DomainEvent.model_validate_json(raw)
    assert back.type == "wearable.vitals.uploaded"
    assert back.subject == "patient-123"
    assert back.data == {"vital_count": 4}
    assert back.specversion == "1.0"


def test_domain_event_matches_backend_wire_shape() -> None:
    """Pin the exact field names against the backend schema.

    If this test fails after a backend change, the agent layer is no longer
    wire-compatible — bump both sides together.
    """
    e = DomainEvent(type="x", source="y")
    fields = set(e.model_dump().keys())
    expected = {"id", "type", "source", "subject", "time", "data", "specversion"}
    assert fields == expected


# ── _parse_event ─────────────────────────────────────────────────────────────


def test_parse_event_returns_none_on_bad_json() -> None:
    assert _parse_event(b"not-json-at-all", routing_key="x") is None


def test_parse_event_returns_none_on_schema_violation() -> None:
    # Missing required 'type' field.
    bad = json.dumps({"source": "s"}).encode()
    assert _parse_event(bad, routing_key="x") is None


def test_parse_event_succeeds_on_minimal_valid_payload() -> None:
    payload = {
        "type": "wearable.vitals.uploaded",
        "source": "wearable-sync-service",
        "subject": "p1",
        "time": datetime.now(timezone.utc).isoformat(),
        "data": {},
    }
    e = _parse_event(json.dumps(payload).encode(), routing_key="x")
    assert e is not None
    assert e.subject == "p1"


# ── EventSubscriber lifecycle (no broker) ────────────────────────────────────


async def test_subscriber_disabled_when_amqp_url_unset() -> None:
    async def noop(_event):
        return None

    sub = EventSubscriber(
        amqp_url=None,
        queue_name="q",
        routing_keys=["x"],
        handler=noop,
    )
    assert sub.enabled is False
    await sub.start()  # should be a no-op, not raise
    await sub.stop()   # also safe


async def test_subscriber_disabled_when_amqp_url_empty_string() -> None:
    async def noop(_event):
        return None

    sub = EventSubscriber(
        amqp_url="",
        queue_name="q",
        routing_keys=["x"],
        handler=noop,
    )
    assert sub.enabled is False
    await sub.start()
    await sub.stop()


async def test_subscriber_stop_without_start_is_safe() -> None:
    async def noop(_event):
        return None

    sub = EventSubscriber(
        amqp_url=None,
        queue_name="q",
        routing_keys=["x"],
        handler=noop,
    )
    await sub.stop()  # no start; must not raise


# ── FakeEventBus ─────────────────────────────────────────────────────────────


async def test_fake_event_bus_routes_by_type() -> None:
    bus = FakeEventBus()
    received: list[DomainEvent] = []

    async def handler(e: DomainEvent) -> None:
        received.append(e)

    bus.subscribe("wearable.vitals.uploaded", handler)
    await bus.publish(
        DomainEvent(type="wearable.vitals.uploaded", source="x", subject="p1")
    )
    await bus.publish(DomainEvent(type="other.event", source="x", subject="p1"))
    assert len(received) == 1
    assert received[0].type == "wearable.vitals.uploaded"


async def test_fake_event_bus_handler_exception_does_not_crash_publish() -> None:
    bus = FakeEventBus()

    async def bad_handler(_e: DomainEvent) -> None:
        raise RuntimeError("boom")

    bus.subscribe("x", bad_handler)
    # Should not propagate the exception.
    await bus.publish(DomainEvent(type="x", source="s"))


async def test_fake_event_bus_multiple_handlers_for_same_key() -> None:
    bus = FakeEventBus()
    counts: list[int] = []

    async def h1(_e: DomainEvent) -> None:
        counts.append(1)

    async def h2(_e: DomainEvent) -> None:
        counts.append(2)

    bus.subscribe("x", h1)
    bus.subscribe("x", h2)
    await bus.publish(DomainEvent(type="x", source="s"))
    assert counts == [1, 2]


# ── Skip-if-aio-pika-missing integration shape ───────────────────────────────


def test_aio_pika_optional_extra_is_not_required_for_unit_tests() -> None:
    """Sanity check: the module must import without aio-pika present, because
    the unit-test environment doesn't install the `events` extra."""
    import importlib
    mod = importlib.import_module("agents.shared.events")
    assert hasattr(mod, "EventSubscriber")
    assert hasattr(mod, "DomainEvent")
