"""Service-level tests: /healthz, /analyze, /chat — all under JWT auth.

The agent's analyze() path makes HTTP calls to ehr_service. We monkeypatch
the fetch helpers at module load so tests don't need a live backend. Auth
headers are minted by the test conftest.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import tools as tools_mod
from app.main import _agent, app  # noqa: F401  (re-export ensures load order)

from .conftest import auth_header

_NOW = datetime.now(timezone.utc)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_healthz(client: TestClient) -> None:
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json()["service"] == "smart_recommend_agent"


def test_analyze_returns_recommendations_for_dangerous_vitals(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_summary(patient_id: str):
        return {
            "active_conditions": ["hypertension"],
            "last_vitals": {"systolic_bp": 165},  # warn-level high
        }

    async def fake_vitals(patient_id: str, *, days_back: int = 180):
        return [
            {
                "metric": "systolic_bp",
                "value": 165,
                "recorded_at": (_NOW - timedelta(days=2)).isoformat(),
            }
        ]

    monkeypatch.setattr(tools_mod, "fetch_ehr_summary", fake_summary)
    monkeypatch.setattr(tools_mod, "fetch_vitals", fake_vitals)
    from app import agent as agent_mod
    monkeypatch.setattr(agent_mod, "fetch_ehr_summary", fake_summary)
    monkeypatch.setattr(agent_mod, "fetch_vitals", fake_vitals)

    resp = client.post("/analyze", json={}, headers=auth_header("p1"))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # patient_id comes from the verified JWT subject, not the body.
    assert body["patient_id"] == "p1"
    assert body["signal_count"] >= 1
    sources = {r["source"] for r in body["recommendations"]}
    assert "rule.dangerous_vital" in sources


def test_analyze_returns_empty_for_healthy_patient(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_summary(patient_id: str):
        return {
            "active_conditions": [],
            "last_vitals": {"systolic_bp": 118, "diastolic_bp": 76},
        }

    async def fake_vitals(patient_id: str, *, days_back: int = 180):
        return [
            {
                "metric": "systolic_bp",
                "value": 118,
                "recorded_at": (_NOW - timedelta(days=3)).isoformat(),
            }
        ]

    from app import agent as agent_mod
    monkeypatch.setattr(agent_mod, "fetch_ehr_summary", fake_summary)
    monkeypatch.setattr(agent_mod, "fetch_vitals", fake_vitals)

    resp = client.post("/analyze", json={}, headers=auth_header("p1"))
    assert resp.status_code == 200
    body = resp.json()
    assert body["signal_count"] == 0
    assert body["recommendations"] == []


def test_chat_smoke(client: TestClient) -> None:
    resp = client.post(
        "/chat",
        json={"message": "what have you noticed lately?"},
        headers=auth_header("p1"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "noticed" in body["reply"].lower()


def test_analyze_rejects_missing_auth(client: TestClient) -> None:
    """Audit finding #4: /analyze must also require auth, not just /chat."""
    resp = client.post("/analyze", json={"patient_id": "p1"})
    assert resp.status_code == 401


def test_analyze_blocks_cross_patient_for_patient_role(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Patient-role token A asking to analyze patient-B → 403 IDOR guard."""
    resp = client.post(
        "/analyze",
        json={"patient_id": "patient-B"},
        headers=auth_header("patient-A"),  # token sub is patient-A
    )
    assert resp.status_code == 403


def test_analyze_admin_can_target_another_patient(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Admin tokens may legitimately operate on any patient."""
    async def fake_summary(patient_id: str):
        return {"active_conditions": [], "last_vitals": {}}

    async def fake_vitals(patient_id: str, *, days_back: int = 180):
        return []

    from app import agent as agent_mod
    monkeypatch.setattr(agent_mod, "fetch_ehr_summary", fake_summary)
    monkeypatch.setattr(agent_mod, "fetch_vitals", fake_vitals)

    resp = client.post(
        "/analyze",
        json={"patient_id": "patient-X"},
        headers=auth_header("ops-user-1", role="admin"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["patient_id"] == "patient-X"
