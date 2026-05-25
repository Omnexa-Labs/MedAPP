"""End-to-end smoke tests for concierge /chat.

Auth is now enforced (audit finding #4). Tests mint a JWT via the test
helper in conftest and send it as `Authorization: Bearer <token>`.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

from .conftest import auth_header


def test_chat_returns_mock_reply() -> None:
    client = TestClient(app)
    resp = client.post(
        "/chat",
        json={"message": "hello concierge", "history": []},
        headers=auth_header("p1"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "hello concierge" in body["reply"]
    assert "tool_calls" in body
    assert "usage" in body


def test_chat_rejects_missing_authorization() -> None:
    client = TestClient(app)
    resp = client.post(
        "/chat",
        json={"message": "hi", "history": []},
    )
    assert resp.status_code == 401


def test_chat_rejects_invalid_token() -> None:
    client = TestClient(app)
    resp = client.post(
        "/chat",
        json={"message": "hi", "history": []},
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert resp.status_code == 401


def test_chat_blocks_cross_patient_attempt() -> None:
    """Patient token A cannot operate on patient B's data (IDOR guard)."""
    client = TestClient(app)
    resp = client.post(
        "/chat",
        json={"patient_id": "patient-B", "message": "show me my stuff"},
        headers=auth_header("patient-A"),  # token is for patient-A
    )
    assert resp.status_code == 403
