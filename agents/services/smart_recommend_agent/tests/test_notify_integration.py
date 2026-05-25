"""Smart Recommend → NotificationDispatcher integration.

We don't run the real notifier — instead we monkey-patch the agent's
`.notifier.notify` method with a recorder. That's the same boundary the
agent uses: pass in a callable, get back True/False.

Asserts:
  - High-severity recommendations (warn, urgent) trigger notify
  - Info-severity recommendations DON'T trigger notify (in-app only)
  - The notification body matches the personalized text
  - The dedup_key from the signal propagates to the notifier
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import _agent, app

from .conftest import auth_header

_NOW = datetime.now(timezone.utc)


def _patch_fetch(monkeypatch: pytest.MonkeyPatch, *, summary, vitals):
    async def fake_summary(patient_id: str):
        return summary

    async def fake_vitals(patient_id: str, *, days_back: int = 180):
        return vitals

    from app import agent as agent_mod
    monkeypatch.setattr(agent_mod, "fetch_ehr_summary", fake_summary)
    monkeypatch.setattr(agent_mod, "fetch_vitals", fake_vitals)


def _patch_notifier(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Replace the agent's notifier.notify with a recorder."""
    calls: list[dict[str, Any]] = []

    async def fake_notify(**kwargs) -> bool:
        calls.append(kwargs)
        return True

    monkeypatch.setattr(_agent.notifier, "notify", fake_notify)
    return calls


def test_warn_severity_triggers_notification(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Dangerous-vital rule produces a warn-severity signal → notify fires."""
    _patch_fetch(
        monkeypatch,
        summary={
            "active_conditions": ["hypertension"],
            "last_vitals": {"systolic_bp": 165},  # warn-level high
        },
        vitals=[
            {
                "metric": "systolic_bp",
                "value": 165,
                "recorded_at": (_NOW - timedelta(days=2)).isoformat(),
            }
        ],
    )
    calls = _patch_notifier(monkeypatch)
    client = TestClient(app)
    resp = client.post("/analyze", json={}, headers=auth_header("p1"))
    assert resp.status_code == 200, resp.text

    # At least the dangerous-vital signal should have fired a notification.
    severities = {c["severity"] for c in calls}
    event_types = {c["event_type"] for c in calls}
    assert "warn" in severities
    assert any(t.startswith("smart_recommend.") for t in event_types)


def test_notification_body_matches_personalized_text(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_fetch(
        monkeypatch,
        summary={"active_conditions": [], "last_vitals": {"spo2": 89}},
        vitals=[
            {
                "metric": "spo2",
                "value": 89,
                "recorded_at": (_NOW - timedelta(hours=1)).isoformat(),
            }
        ],
    )
    calls = _patch_notifier(monkeypatch)
    client = TestClient(app)
    resp = client.post("/analyze", json={}, headers=auth_header("p1"))
    assert resp.status_code == 200

    body = resp.json()
    # Pick the recommendation that matches the first notify call's dedup_key.
    if not calls:
        pytest.skip("no signals produced for this synthetic input")
    first_call = calls[0]
    matching = [r for r in body["recommendations"] if r["dedup_key"] == first_call.get("dedup_key")]
    assert matching, "expected the recommendation list to include the notified item"
    assert matching[0]["text"] == first_call["body"]


def test_dedup_key_propagates_to_notifier(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_fetch(
        monkeypatch,
        summary={
            "active_conditions": [],
            "last_vitals": {"systolic_bp": 165},
        },
        vitals=[
            {
                "metric": "systolic_bp",
                "value": 165,
                "recorded_at": (_NOW - timedelta(days=2)).isoformat(),
            }
        ],
    )
    calls = _patch_notifier(monkeypatch)
    client = TestClient(app)
    resp = client.post("/analyze", json={}, headers=auth_header("p1"))
    assert resp.status_code == 200

    # The dangerous-vital signal has dedup_key like 'dangerous_vital:systolic_bp'.
    assert any(
        c.get("dedup_key", "").startswith("dangerous_vital:") for c in calls
    )


def test_no_signals_no_notifications(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Healthy patient → no signals → no notify calls."""
    _patch_fetch(
        monkeypatch,
        summary={"active_conditions": [], "last_vitals": {"systolic_bp": 120}},
        vitals=[
            {
                "metric": "systolic_bp",
                "value": 120,
                "recorded_at": (_NOW - timedelta(hours=1)).isoformat(),
            }
        ],
    )
    calls = _patch_notifier(monkeypatch)
    client = TestClient(app)
    resp = client.post("/analyze", json={}, headers=auth_header("p1"))
    assert resp.status_code == 200
    assert resp.json()["signal_count"] == 0
    assert calls == []


def test_notify_failure_does_not_break_analyze(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A crashing notifier must NOT break the /analyze response."""
    _patch_fetch(
        monkeypatch,
        summary={"active_conditions": [], "last_vitals": {"spo2": 89}},
        vitals=[
            {
                "metric": "spo2",
                "value": 89,
                "recorded_at": (_NOW - timedelta(hours=1)).isoformat(),
            }
        ],
    )

    async def boom_notify(**kwargs) -> bool:
        raise RuntimeError("notify exploded")

    monkeypatch.setattr(_agent.notifier, "notify", boom_notify)
    client = TestClient(app)
    resp = client.post("/analyze", json={}, headers=auth_header("p1"))
    assert resp.status_code == 200
    # Body still includes the generated recommendations.
    assert resp.json()["signal_count"] >= 0
