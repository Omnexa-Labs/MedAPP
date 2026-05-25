"""AnalysisDispatcher — patient-id extraction + per-patient throttling."""
from __future__ import annotations

import asyncio

import pytest

from agents.shared.events import DomainEvent

from app.agent import AnalyzeRequest, SmartRecommendAgent
from app.dispatcher import AnalysisDispatcher, _extract_patient_id


# ── patient_id extraction ────────────────────────────────────────────────────


def test_extract_prefers_subject() -> None:
    e = DomainEvent(type="x", source="s", subject="patient-A", data={"patient_id": "B"})
    assert _extract_patient_id(e) == "patient-A"


def test_extract_falls_back_to_data_patient_id() -> None:
    e = DomainEvent(type="x", source="s", data={"patient_id": "patient-B"})
    assert _extract_patient_id(e) == "patient-B"


def test_extract_returns_none_when_missing() -> None:
    e = DomainEvent(type="x", source="s")
    assert _extract_patient_id(e) is None


def test_extract_ignores_non_string_patient_id() -> None:
    e = DomainEvent(type="x", source="s", data={"patient_id": 42})
    assert _extract_patient_id(e) is None


# ── Throttling ────────────────────────────────────────────────────────────────


class _RecordingAgent:
    """Stand-in for SmartRecommendAgent.analyze — counts calls."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    async def analyze(self, req: AnalyzeRequest):
        self.calls.append(req.patient_id)
        return None


@pytest.fixture
def recording_agent() -> _RecordingAgent:
    return _RecordingAgent()


async def test_first_event_triggers_analyze(recording_agent: _RecordingAgent) -> None:
    d = AnalysisDispatcher(recording_agent, min_interval_seconds=300)  # type: ignore[arg-type]
    await d.on_event(DomainEvent(type="wearable.vitals.uploaded", source="x", subject="p1"))
    assert recording_agent.calls == ["p1"]


async def test_burst_for_same_patient_is_throttled(recording_agent: _RecordingAgent) -> None:
    d = AnalysisDispatcher(recording_agent, min_interval_seconds=300)  # type: ignore[arg-type]
    for _ in range(5):
        await d.on_event(
            DomainEvent(type="wearable.vitals.uploaded", source="x", subject="p1")
        )
    assert recording_agent.calls == ["p1"], "expected single analyze; got %r" % recording_agent.calls


async def test_different_patients_not_throttled(recording_agent: _RecordingAgent) -> None:
    d = AnalysisDispatcher(recording_agent, min_interval_seconds=300)  # type: ignore[arg-type]
    await d.on_event(DomainEvent(type="x", source="s", subject="alice"))
    await d.on_event(DomainEvent(type="x", source="s", subject="bob"))
    await d.on_event(DomainEvent(type="x", source="s", subject="carol"))
    assert recording_agent.calls == ["alice", "bob", "carol"]


async def test_event_without_patient_id_does_not_analyze(
    recording_agent: _RecordingAgent,
) -> None:
    d = AnalysisDispatcher(recording_agent, min_interval_seconds=300)  # type: ignore[arg-type]
    await d.on_event(DomainEvent(type="x", source="s"))
    assert recording_agent.calls == []


async def test_analyze_failure_is_swallowed() -> None:
    class _BoomAgent:
        async def analyze(self, req):
            raise RuntimeError("downstream fail")

    d = AnalysisDispatcher(_BoomAgent(), min_interval_seconds=300)  # type: ignore[arg-type]
    # Should not propagate.
    await d.on_event(DomainEvent(type="x", source="s", subject="p1"))


async def test_throttle_clears_after_interval(recording_agent: _RecordingAgent) -> None:
    """With a 0s interval, every event should trigger analysis."""
    d = AnalysisDispatcher(recording_agent, min_interval_seconds=0)  # type: ignore[arg-type]
    for _ in range(3):
        await d.on_event(DomainEvent(type="x", source="s", subject="p1"))
    assert recording_agent.calls == ["p1", "p1", "p1"]


async def test_capacity_evicts_oldest_patients() -> None:
    agent = _RecordingAgent()
    d = AnalysisDispatcher(agent, min_interval_seconds=300, capacity=2)  # type: ignore[arg-type]

    await d.on_event(DomainEvent(type="x", source="s", subject="alice"))
    await d.on_event(DomainEvent(type="x", source="s", subject="bob"))
    # Carol evicts alice from the recency map.
    await d.on_event(DomainEvent(type="x", source="s", subject="carol"))
    # Alice should no longer be throttled (her entry was evicted).
    await d.on_event(DomainEvent(type="x", source="s", subject="alice"))
    assert agent.calls == ["alice", "bob", "carol", "alice"]


# ── Concurrency safety ───────────────────────────────────────────────────────


async def test_concurrent_events_for_same_patient_still_throttle() -> None:
    """Parallel deliveries shouldn't all slip past the throttle."""
    agent = _RecordingAgent()
    d = AnalysisDispatcher(agent, min_interval_seconds=300)  # type: ignore[arg-type]
    await asyncio.gather(
        *[
            d.on_event(DomainEvent(type="x", source="s", subject="p1"))
            for _ in range(10)
        ]
    )
    assert agent.calls == ["p1"], "expected throttle to hold under concurrency; got %r" % agent.calls
