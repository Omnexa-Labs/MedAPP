"""AnomalyDispatcher → NotificationDispatcher integration tests.

We inject a fake `notify` callable into AnomalyDispatcher and assert:

- Notify is called on critical and warning anomalies
- Notify is NOT called when no anomalies fire (silence on healthy scans)
- The highest severity is surfaced in the notification
- A dedup_key is composed from the constituent anomalies
- A crashing notify never breaks the dispatcher loop
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

from agents.shared.events import DomainEvent

from app.dispatcher import AnomalyDispatcher


_NOW = datetime(2026, 5, 21, 12, 0, tzinfo=timezone.utc)


def _critical_sample(metric: str = "heart_rate", value: float = 185.0) -> dict[str, Any]:
    return {
        "metric": metric,
        "value": value,
        "unit": "bpm",
        "recorded_at": _NOW.isoformat(),
    }


def _warning_sample(metric: str = "spo2", value: float = 90.0) -> dict[str, Any]:
    return {
        "metric": metric,
        "value": value,
        "unit": "%",
        "recorded_at": _NOW.isoformat(),
    }


def _healthy_sample() -> dict[str, Any]:
    return {
        "metric": "heart_rate",
        "value": 72,
        "unit": "bpm",
        "recorded_at": _NOW.isoformat(),
    }


def _make_dispatcher(
    samples: list[dict[str, Any]],
) -> tuple[AnomalyDispatcher, list[dict[str, Any]], list[dict[str, Any]]]:
    """Returns (dispatcher, publish_log, notify_log)."""
    publish_log: list[dict[str, Any]] = []
    notify_log: list[dict[str, Any]] = []

    async def fake_fetch(patient_id: str, hours_back: int) -> list[dict[str, Any]]:
        return list(samples)

    async def fake_publish(**kwargs) -> None:
        publish_log.append(kwargs)

    async def fake_notify(**kwargs) -> bool:
        notify_log.append(kwargs)
        return True

    d = AnomalyDispatcher(
        fetch_vitals=fake_fetch,
        publish=fake_publish,
        notify=fake_notify,
        min_interval_seconds=0,  # don't suppress in these tests
    )
    return d, publish_log, notify_log


# ── Notify fires on detections ──────────────────────────────────────────────


async def test_critical_anomaly_triggers_notification() -> None:
    d, _publish, notify_log = _make_dispatcher([_critical_sample()])
    await d.on_event(
        DomainEvent(type="wearable.vitals.uploaded", source="x", subject="p1")
    )
    assert len(notify_log) == 1
    n = notify_log[0]
    assert n["patient_id"] == "p1"
    assert n["severity"] == "critical"
    assert n["event_type"] == "vitals_watcher.critical"
    assert "vital sign needs attention" in n["title"].lower() or "important" in n["title"].lower()
    assert "185" in n["body"] or "critical" in n["body"].lower()


async def test_warning_anomaly_triggers_notification() -> None:
    d, _publish, notify_log = _make_dispatcher([_warning_sample()])
    await d.on_event(
        DomainEvent(type="wearable.vitals.uploaded", source="x", subject="p1")
    )
    assert len(notify_log) == 1
    assert notify_log[0]["severity"] == "warning"
    assert notify_log[0]["event_type"] == "vitals_watcher.warning"


async def test_no_anomalies_no_notification() -> None:
    d, _publish, notify_log = _make_dispatcher([_healthy_sample()])
    await d.on_event(
        DomainEvent(type="wearable.vitals.uploaded", source="x", subject="p1")
    )
    assert notify_log == []


# ── Severity rollup ─────────────────────────────────────────────────────────


async def test_mixed_anomalies_use_highest_severity() -> None:
    d, _publish, notify_log = _make_dispatcher(
        [_critical_sample(), _warning_sample()]
    )
    await d.on_event(
        DomainEvent(type="wearable.vitals.uploaded", source="x", subject="p1")
    )
    assert len(notify_log) == 1
    assert notify_log[0]["severity"] == "critical"
    # Body lists both anomalies, critical first.
    body = notify_log[0]["body"]
    assert "heart_rate" in body or "185" in body
    assert "spo2" in body or "90" in body


# ── Dedup key composition ───────────────────────────────────────────────────


async def test_dedup_key_combines_constituent_anomalies() -> None:
    d, _publish, notify_log = _make_dispatcher(
        [_critical_sample(), _warning_sample()]
    )
    await d.on_event(
        DomainEvent(type="wearable.vitals.uploaded", source="x", subject="p1")
    )
    assert len(notify_log) == 1
    dedup_key = notify_log[0]["dedup_key"]
    # Both metric dedup_keys (heart_rate:..., spo2:...) should appear.
    assert "heart_rate" in dedup_key
    assert "spo2" in dedup_key
    # Stable sort means same-set→same-key on re-fire.
    parts = dedup_key.split("|")
    assert parts == sorted(parts)


# ── Failure isolation ──────────────────────────────────────────────────────


async def test_crashing_notify_does_not_break_dispatcher() -> None:
    publish_log: list[dict[str, Any]] = []

    async def fake_fetch(patient_id: str, hours_back: int):
        return [_critical_sample()]

    async def fake_publish(**kwargs) -> None:
        publish_log.append(kwargs)

    async def boom_notify(**kwargs) -> bool:
        raise RuntimeError("notify exploded")

    d = AnomalyDispatcher(
        fetch_vitals=fake_fetch,
        publish=fake_publish,
        notify=boom_notify,
        min_interval_seconds=0,
    )
    # Should not raise — publish still succeeds.
    await d.on_event(
        DomainEvent(type="wearable.vitals.uploaded", source="x", subject="p1")
    )
    assert len(publish_log) == 1


async def test_no_notify_callable_is_supported() -> None:
    """Backwards compat: dispatcher without a notify callable still works.

    This is the path used by existing test_dispatcher.py — they construct
    AnomalyDispatcher with no `notify=`, so we shouldn't break them.
    """
    publish_log: list[dict[str, Any]] = []

    async def fake_fetch(patient_id: str, hours_back: int):
        return [_critical_sample()]

    async def fake_publish(**kwargs) -> None:
        publish_log.append(kwargs)

    d = AnomalyDispatcher(
        fetch_vitals=fake_fetch,
        publish=fake_publish,
        min_interval_seconds=0,
    )
    await d.on_event(
        DomainEvent(type="wearable.vitals.uploaded", source="x", subject="p1")
    )
    assert len(publish_log) == 1
