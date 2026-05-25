"""AnomalyDispatcher tests — event in, anomaly event out.

The dispatcher is decoupled from real HTTP and real RabbitMQ via two
injected callables: `fetch_vitals` and `publish`. Tests substitute fakes
to assert the end-to-end behaviour without standing up infrastructure.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import pytest

from agents.shared.events import DomainEvent

from app.dispatcher import AnomalyDispatcher


_NOW = datetime(2026, 5, 21, 12, 0, tzinfo=timezone.utc)


# ── Fakes ───────────────────────────────────────────────────────────────────


def _make_fakes(
    samples: list[dict[str, Any]] | None = None,
) -> tuple[AnomalyDispatcher, list[dict[str, Any]]]:
    """Builds a dispatcher wired to fakes; returns (dispatcher, publish_log)."""
    samples = samples or []
    publish_log: list[dict[str, Any]] = []

    async def fake_fetch(patient_id: str, hours_back: int) -> list[dict[str, Any]]:
        return list(samples)

    async def fake_publish(*, event_type: str, subject: str, data: dict[str, Any]) -> None:
        publish_log.append({"event_type": event_type, "subject": subject, "data": data})

    d = AnomalyDispatcher(
        fetch_vitals=fake_fetch,
        publish=fake_publish,
        min_interval_seconds=300,  # tight enough for throttle tests; 0 elsewhere
    )
    return d, publish_log


def _critical_sample(metric: str = "heart_rate", value: float = 185.0) -> dict[str, Any]:
    return {
        "metric": metric,
        "value": value,
        "unit": "bpm",
        "recorded_at": _NOW.isoformat(),
    }


def _healthy_sample() -> dict[str, Any]:
    return {
        "metric": "heart_rate",
        "value": 72,
        "unit": "bpm",
        "recorded_at": _NOW.isoformat(),
    }


# ── End-to-end ──────────────────────────────────────────────────────────────


async def test_anomaly_event_publishes_when_detection_fires() -> None:
    d, log = _make_fakes([_critical_sample()])
    await d.on_event(
        DomainEvent(
            type="wearable.vitals.uploaded",
            source="wearable-sync-service",
            subject="patient-1",
            data={"sample_kinds": ["heart_rate"]},
        )
    )
    assert len(log) == 1
    event = log[0]
    assert event["event_type"] == "vitals.anomaly.detected"
    assert event["subject"] == "patient-1"
    assert event["data"]["patient_id"] == "patient-1"
    assert event["data"]["severity"] == "critical"
    assert len(event["data"]["anomalies"]) == 1
    assert event["data"]["anomalies"][0]["metric"] == "heart_rate"


async def test_no_publish_when_no_anomalies() -> None:
    """Silence on the bus equals 'no problems found'."""
    d, log = _make_fakes([_healthy_sample()])
    await d.on_event(
        DomainEvent(
            type="wearable.vitals.uploaded",
            source="wearable-sync-service",
            subject="patient-1",
        )
    )
    assert log == []


async def test_no_publish_when_fetch_returns_empty() -> None:
    d, log = _make_fakes([])
    await d.on_event(
        DomainEvent(type="wearable.vitals.uploaded", source="x", subject="p1")
    )
    assert log == []


async def test_highest_severity_surfaced_at_event_level() -> None:
    """Mixed warning+critical anomalies should bubble 'critical' to the top."""
    samples = [
        _critical_sample("heart_rate", 185),  # critical
        {  # warning
            "metric": "spo2",
            "value": 90,
            "unit": "%",
            "recorded_at": _NOW.isoformat(),
        },
    ]
    d, log = _make_fakes(samples)
    await d.on_event(
        DomainEvent(type="wearable.vitals.uploaded", source="x", subject="p1")
    )
    assert len(log) == 1
    assert log[0]["data"]["severity"] == "critical"
    assert len(log[0]["data"]["anomalies"]) == 2


async def test_device_metadata_is_forwarded_when_present() -> None:
    d, log = _make_fakes([_critical_sample()])
    await d.on_event(
        DomainEvent(
            type="wearable.vitals.uploaded",
            source="x",
            subject="p1",
            data={"device": {"provider": "fitbit", "external_id": "fitbit-99"}},
        )
    )
    assert log[0]["data"]["device"] == {"provider": "fitbit", "external_id": "fitbit-99"}


async def test_no_patient_id_no_publish() -> None:
    d, log = _make_fakes([_critical_sample()])
    await d.on_event(DomainEvent(type="x", source="s"))
    assert log == []


async def test_patient_id_falls_back_to_data() -> None:
    d, log = _make_fakes([_critical_sample()])
    await d.on_event(
        DomainEvent(type="x", source="s", data={"patient_id": "from-data"})
    )
    assert len(log) == 1
    assert log[0]["subject"] == "from-data"


# ── Throttling ──────────────────────────────────────────────────────────────


async def test_burst_for_same_patient_throttled_to_one_publish() -> None:
    d, log = _make_fakes([_critical_sample()])
    for _ in range(5):
        await d.on_event(
            DomainEvent(type="wearable.vitals.uploaded", source="x", subject="p1")
        )
    assert len(log) == 1


async def test_different_patients_not_throttled() -> None:
    d, log = _make_fakes([_critical_sample()])
    await d.on_event(DomainEvent(type="x", source="s", subject="alice"))
    await d.on_event(DomainEvent(type="x", source="s", subject="bob"))
    assert len(log) == 2
    assert {e["subject"] for e in log} == {"alice", "bob"}


async def test_concurrent_events_for_same_patient_throttle_under_lock() -> None:
    d, log = _make_fakes([_critical_sample()])
    await asyncio.gather(
        *[
            d.on_event(DomainEvent(type="x", source="s", subject="p1"))
            for _ in range(10)
        ]
    )
    assert len(log) == 1


async def test_zero_interval_lets_every_event_through() -> None:
    publish_log: list[dict[str, Any]] = []

    async def fake_fetch(patient_id: str, hours_back: int) -> list[dict[str, Any]]:
        return [_critical_sample()]

    async def fake_publish(**kwargs) -> None:
        publish_log.append(kwargs)

    d = AnomalyDispatcher(
        fetch_vitals=fake_fetch,
        publish=fake_publish,
        min_interval_seconds=0,
    )
    for _ in range(3):
        await d.on_event(DomainEvent(type="x", source="s", subject="p1"))
    assert len(publish_log) == 3


# ── Failure modes ───────────────────────────────────────────────────────────


async def test_fetch_exception_is_swallowed_no_publish() -> None:
    publish_log: list[dict[str, Any]] = []

    async def boom_fetch(patient_id: str, hours_back: int) -> list[dict[str, Any]]:
        raise RuntimeError("ehr down")

    async def fake_publish(**kwargs) -> None:
        publish_log.append(kwargs)

    d = AnomalyDispatcher(
        fetch_vitals=boom_fetch,
        publish=fake_publish,
        min_interval_seconds=0,
    )
    await d.on_event(DomainEvent(type="x", source="s", subject="p1"))
    assert publish_log == []


async def test_publish_exception_does_not_propagate() -> None:
    async def fake_fetch(patient_id: str, hours_back: int):
        return [_critical_sample()]

    async def boom_publish(**kwargs) -> None:
        raise RuntimeError("rabbit gone")

    d = AnomalyDispatcher(
        fetch_vitals=fake_fetch,
        publish=boom_publish,
        min_interval_seconds=0,
    )
    # Should not raise.
    await d.on_event(DomainEvent(type="x", source="s", subject="p1"))
