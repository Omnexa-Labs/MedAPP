"""Service-level tests: /healthz, /chat under JWT auth.

Memory disabled and AMQP unset (per conftest), so the agent runs in
pull-only mode. The /chat path with MockLLM doesn't actually call the
tool, but the integration still exercises auth + lifespan startup.
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
    assert resp.json()["service"] == "vitals_watcher_agent"


def test_chat_requires_auth(client: TestClient) -> None:
    resp = client.post("/chat", json={"message": "any anomalies today?"})
    assert resp.status_code == 401


def test_chat_with_valid_token_returns_reply(client: TestClient) -> None:
    resp = client.post(
        "/chat",
        json={"message": "is my heart rate ok"},
        headers=auth_header("p1"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["reply"]


def test_chat_blocks_cross_patient(client: TestClient) -> None:
    resp = client.post(
        "/chat",
        json={"patient_id": "patient-B", "message": "show me anomalies"},
        headers=auth_header("patient-A"),
    )
    assert resp.status_code == 403


def test_chat_admin_can_act_on_another_patient(client: TestClient) -> None:
    resp = client.post(
        "/chat",
        json={"patient_id": "patient-X", "message": "ops review"},
        headers=auth_header("ops-user", role="admin"),
    )
    assert resp.status_code == 200
