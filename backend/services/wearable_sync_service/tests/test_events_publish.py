"""Tests for the `wearable.vitals.uploaded` producer side (outbox path).

Audit finding B-20 changed the contract: the router now writes events
into the `outbox_events` table inside the same DB session as the sample
writes. A background drain worker (in lifespan) publishes from the
outbox to RabbitMQ later. So instead of asserting `events.publish` was
called, these tests inspect the outbox table after the request.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import select

from app.main import app
from shared.events import OutboxEvent


async def _outbox_rows(sessionmaker) -> list[OutboxEvent]:
    async with sessionmaker() as session:
        result = await session.scalars(select(OutboxEvent).order_by(OutboxEvent.created_at))
        return list(result.all())


@pytest.mark.asyncio
async def test_successful_sync_writes_to_outbox(client, sessionmaker, principal) -> None:
    async def ehr_ok(request: httpx.Request) -> httpx.Response:
        return httpx.Response(201, json={"vital_id": str(uuid4())})

    app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(ehr_ok), base_url="http://ehr")
    try:
        response = await client.post(
            "/v1/wearables/sync",
            json={
                "device": {"provider": "fitbit", "external_id": "fitbit-99"},
                "samples": [
                    {
                        "kind": "heart_rate",
                        "value": "72",
                        "unit": "bpm",
                        "recorded_at": datetime.now(tz=UTC).isoformat(),
                    },
                    {
                        "kind": "steps",
                        "value": "1200",
                        "unit": "count",
                        "recorded_at": (datetime.now(tz=UTC) + timedelta(minutes=5)).isoformat(),
                    },
                ],
            },
        )
    finally:
        await app.state.http.aclose()

    assert response.status_code == 201

    rows = await _outbox_rows(sessionmaker)
    assert len(rows) == 1
    row = rows[0]
    assert row.event_type == "wearable.vitals.uploaded"
    assert row.routing_key == "wearable.vitals.uploaded"
    assert row.subject == principal.subject
    assert row.source == "wearable-sync-service"
    assert row.published_at is None  # not yet drained
    assert row.attempts == 0
    data = row.payload
    assert data["patient_id"] == principal.subject
    assert data["synced_count"] == 2
    assert data["sample_kinds"] == ["heart_rate", "steps"]


@pytest.mark.asyncio
async def test_zero_synced_does_not_write_outbox(client, sessionmaker) -> None:
    """0-synced batches must not enqueue events."""
    async def ehr_down(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="ehr unavailable")

    app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(ehr_down), base_url="http://ehr")
    try:
        response = await client.post(
            "/v1/wearables/sync",
            json={
                "device": {"provider": "garmin", "external_id": "g-1"},
                "samples": [
                    {
                        "kind": "blood_pressure",
                        "value": "120/80",
                        "unit": "mmHg",
                        "recorded_at": datetime.now(tz=UTC).isoformat(),
                    }
                ],
            },
        )
    finally:
        await app.state.http.aclose()

    assert response.status_code == 201
    rows = await _outbox_rows(sessionmaker)
    assert rows == []


@pytest.mark.asyncio
async def test_partial_sync_outbox_reflects_synced_kinds(client, sessionmaker) -> None:
    call_count = {"n": 0}

    async def ehr_flaky(request: httpx.Request) -> httpx.Response:
        call_count["n"] += 1
        if call_count["n"] == 1:
            return httpx.Response(201, json={"vital_id": str(uuid4())})
        return httpx.Response(500, text="boom")

    app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(ehr_flaky), base_url="http://ehr")
    try:
        response = await client.post(
            "/v1/wearables/sync",
            json={
                "device": {"provider": "apple_health", "external_id": "watch-2"},
                "samples": [
                    {
                        "kind": "heart_rate",
                        "value": "70",
                        "unit": "bpm",
                        "recorded_at": datetime.now(tz=UTC).isoformat(),
                    },
                    {
                        "kind": "glucose",
                        "value": "5.5",
                        "unit": "mmol/L",
                        "recorded_at": (datetime.now(tz=UTC) + timedelta(minutes=1)).isoformat(),
                    },
                ],
            },
        )
    finally:
        await app.state.http.aclose()

    assert response.status_code == 201
    rows = await _outbox_rows(sessionmaker)
    assert len(rows) == 1
    assert rows[0].payload["sample_kinds"] == ["heart_rate"]
    assert rows[0].payload["synced_count"] == 1
    assert rows[0].payload["failed_count"] == 1


# ── Outbox drain round-trip (B-20) ──────────────────────────────────────────


class _FakeBus:
    """Captures publishes — stands in for a real EventBus during drain."""

    def __init__(self, *, fail_first_n: int = 0) -> None:
        self.publishes: list[dict] = []
        self._remaining_failures = fail_first_n

    async def publish(self, event, routing_key=None):
        if self._remaining_failures > 0:
            self._remaining_failures -= 1
            raise RuntimeError("simulated broker outage")
        self.publishes.append(
            {
                "type": event.type,
                "subject": event.subject,
                "routing_key": routing_key,
                "data": event.data,
            }
        )


@pytest.mark.asyncio
async def test_outbox_drain_publishes_and_marks_rows(client, sessionmaker, principal) -> None:
    from shared.events import drain_outbox

    async def ehr_ok(request: httpx.Request) -> httpx.Response:
        return httpx.Response(201, json={"vital_id": str(uuid4())})

    # Write a row to the outbox via a successful sync.
    app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(ehr_ok), base_url="http://ehr")
    try:
        await client.post(
            "/v1/wearables/sync",
            json={
                "device": {"provider": "fitbit", "external_id": "fitbit-drain"},
                "samples": [
                    {
                        "kind": "heart_rate",
                        "value": "70",
                        "unit": "bpm",
                        "recorded_at": datetime.now(tz=UTC).isoformat(),
                    }
                ],
            },
        )
    finally:
        await app.state.http.aclose()

    # Drain with a fake bus and confirm the row is marked published.
    bus = _FakeBus()
    async with sessionmaker() as session:
        published = await drain_outbox(session, bus)
        await session.commit()
    assert published == 1

    rows = await _outbox_rows(sessionmaker)
    assert len(rows) == 1
    assert rows[0].published_at is not None
    assert rows[0].last_error is None
    assert len(bus.publishes) == 1
    assert bus.publishes[0]["type"] == "wearable.vitals.uploaded"
    assert bus.publishes[0]["subject"] == principal.subject


@pytest.mark.asyncio
async def test_outbox_drain_records_failure_and_retries(client, sessionmaker) -> None:
    """A broker failure during drain must leave the row unpublished and
    increment `attempts` — so the next drain tries again."""
    from shared.events import drain_outbox

    async def ehr_ok(request: httpx.Request) -> httpx.Response:
        return httpx.Response(201, json={"vital_id": str(uuid4())})

    app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(ehr_ok), base_url="http://ehr")
    try:
        await client.post(
            "/v1/wearables/sync",
            json={
                "device": {"provider": "fitbit", "external_id": "fitbit-retry"},
                "samples": [
                    {
                        "kind": "heart_rate",
                        "value": "70",
                        "unit": "bpm",
                        "recorded_at": datetime.now(tz=UTC).isoformat(),
                    }
                ],
            },
        )
    finally:
        await app.state.http.aclose()

    failing_bus = _FakeBus(fail_first_n=1)
    async with sessionmaker() as session:
        published = await drain_outbox(session, failing_bus)
        await session.commit()
    assert published == 0

    rows = await _outbox_rows(sessionmaker)
    assert len(rows) == 1
    assert rows[0].published_at is None
    assert rows[0].attempts == 1
    assert rows[0].last_error is not None
    assert "simulated broker outage" in rows[0].last_error

    # Next drain with a healthy bus succeeds.
    healthy_bus = _FakeBus()
    async with sessionmaker() as session:
        published = await drain_outbox(session, healthy_bus)
        await session.commit()
    assert published == 1
    rows = await _outbox_rows(sessionmaker)
    assert rows[0].published_at is not None


@pytest.mark.asyncio
async def test_outbox_drain_stops_at_max_attempts(client, sessionmaker) -> None:
    """A row that fails `max_attempts` times must be skipped on future
    drains — operator intervenes (manually replay or delete)."""
    from shared.events import drain_outbox

    async def ehr_ok(request: httpx.Request) -> httpx.Response:
        return httpx.Response(201, json={"vital_id": str(uuid4())})

    app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(ehr_ok), base_url="http://ehr")
    try:
        await client.post(
            "/v1/wearables/sync",
            json={
                "device": {"provider": "fitbit", "external_id": "fitbit-max"},
                "samples": [
                    {
                        "kind": "heart_rate",
                        "value": "70",
                        "unit": "bpm",
                        "recorded_at": datetime.now(tz=UTC).isoformat(),
                    }
                ],
            },
        )
    finally:
        await app.state.http.aclose()

    failing_bus = _FakeBus(fail_first_n=100)  # always fails
    # Run 4 drains with max_attempts=3 — after the 3rd, row is "stuck"
    # and the 4th drain sees zero rows because `attempts < max_attempts`
    # excludes it.
    for _ in range(3):
        async with sessionmaker() as session:
            await drain_outbox(session, failing_bus, max_attempts=3)
            await session.commit()

    rows = await _outbox_rows(sessionmaker)
    assert rows[0].attempts == 3
    assert rows[0].published_at is None

    # Fourth drain: row is excluded from the query.
    async with sessionmaker() as session:
        published = await drain_outbox(session, failing_bus, max_attempts=3)
        await session.commit()
    assert published == 0
