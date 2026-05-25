"""Service-level tests for booking_agent.

Smoke tests covering auth, IDOR, and the chat happy path. The booking
workflow itself (multi-turn confirmation, slot picking) is best validated
end-to-end against a real backend — we exercise the wiring here.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

from .conftest import auth_header


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_healthz(client: TestClient) -> None:
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json()["service"] == "booking_agent"


def test_chat_requires_auth(client: TestClient) -> None:
    resp = client.post("/chat", json={"message": "book me a cardiologist"})
    assert resp.status_code == 401


def test_chat_returns_mock_reply(client: TestClient) -> None:
    resp = client.post(
        "/chat",
        json={"message": "book me a cardiologist next week"},
        headers=auth_header("p1"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["reply"]
    # MockLLM echoes the input.
    assert "cardiologist" in body["reply"].lower()


def test_chat_blocks_cross_patient(client: TestClient) -> None:
    """Patient A cannot make a booking for patient B (IDOR guard)."""
    resp = client.post(
        "/chat",
        json={"patient_id": "patient-B", "message": "cancel my appointment"},
        headers=auth_header("patient-A"),
    )
    assert resp.status_code == 403


def test_chat_admin_can_act_on_another_patient(client: TestClient) -> None:
    resp = client.post(
        "/chat",
        json={"patient_id": "patient-X", "message": "list bookings for ops review"},
        headers=auth_header("ops-user", role="admin"),
    )
    assert resp.status_code == 200
