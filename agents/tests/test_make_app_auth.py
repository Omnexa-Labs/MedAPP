"""HTTP-level auth tests for `make_app`.

Builds a minimal BaseAgent + make_app, then exercises /chat through
TestClient with various Authorization headers to verify:
  - missing/invalid tokens are rejected
  - non-admin tokens cannot operate on a different patient_id (IDOR)
  - admin tokens may pass an explicit patient_id
  - the agent receives the verified patient_id, NOT the request body
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from agents.shared import (
    AgentRequest,
    AgentResponse,
    BaseAgent,
    issue_test_token,
    make_app,
)


_SECRET = "test-make-app-secret-7c2e-and-padding-for-hs256-min-key-length"


class _EchoAgent(BaseAgent):
    """Returns the resolved patient_id in the reply so tests can assert it."""

    name = "echo"

    def __init__(self, *, jwt_secret: str = _SECRET) -> None:
        super().__init__()
        self.jwt_secret = jwt_secret
        # Captures the patient_id the agent saw, for assertions.
        self.last_seen_patient_id: str | None = None

    async def handle(self, req: AgentRequest) -> AgentResponse:
        self.last_seen_patient_id = req.patient_id
        return AgentResponse(reply=f"saw:{req.patient_id}", tool_calls=[], usage={})


def _client(agent: _EchoAgent) -> TestClient:
    app = make_app(agent, service_name="echo_agent")
    return TestClient(app)


def _bearer(patient_id: str, role: str = "patient") -> dict[str, str]:
    token = issue_test_token(patient_id, secret=_SECRET, role=role)
    return {"Authorization": f"Bearer {token}"}


def test_chat_rejects_missing_authorization() -> None:
    agent = _EchoAgent()
    resp = _client(agent).post("/chat", json={"message": "hi"})
    assert resp.status_code == 401


def test_chat_rejects_invalid_token() -> None:
    agent = _EchoAgent()
    resp = _client(agent).post(
        "/chat", json={"message": "hi"}, headers={"Authorization": "Bearer garbage"}
    )
    assert resp.status_code == 401


def test_chat_accepts_valid_token_and_uses_jwt_subject() -> None:
    agent = _EchoAgent()
    resp = _client(agent).post(
        "/chat", json={"message": "hi"}, headers=_bearer("real-patient")
    )
    assert resp.status_code == 200
    assert resp.json()["reply"] == "saw:real-patient"
    assert agent.last_seen_patient_id == "real-patient"


def test_chat_overrides_body_patient_id_with_jwt_subject() -> None:
    """If a client sends a body patient_id that MATCHES the JWT, it's accepted.

    The downstream handler sees the JWT-derived value either way — clients
    cannot influence it by changing the body.
    """
    agent = _EchoAgent()
    resp = _client(agent).post(
        "/chat",
        json={"patient_id": "real-patient", "message": "hi"},
        headers=_bearer("real-patient"),
    )
    assert resp.status_code == 200
    assert agent.last_seen_patient_id == "real-patient"


def test_chat_blocks_cross_patient_attempt_with_403() -> None:
    """Audit finding #4: token for A trying to act on B → 403, not 200."""
    agent = _EchoAgent()
    resp = _client(agent).post(
        "/chat",
        json={"patient_id": "patient-B", "message": "show me my labs"},
        headers=_bearer("patient-A"),
    )
    assert resp.status_code == 403
    assert agent.last_seen_patient_id is None  # handler never ran


def test_chat_admin_may_target_another_patient() -> None:
    agent = _EchoAgent()
    resp = _client(agent).post(
        "/chat",
        json={"patient_id": "patient-X", "message": "ops review"},
        headers=_bearer("ops-user-1", role="admin"),
    )
    assert resp.status_code == 200
    assert agent.last_seen_patient_id == "patient-X"


def test_chat_admin_without_explicit_patient_id_uses_own_subject() -> None:
    """Admin tokens without an explicit body patient_id default to themselves."""
    agent = _EchoAgent()
    resp = _client(agent).post(
        "/chat",
        json={"message": "hi"},
        headers=_bearer("ops-user-1", role="admin"),
    )
    assert resp.status_code == 200
    assert agent.last_seen_patient_id == "ops-user-1"


def test_healthz_does_not_require_auth() -> None:
    """k8s/container probes must be able to reach /healthz unauthenticated."""
    agent = _EchoAgent()
    resp = _client(agent).get("/healthz")
    assert resp.status_code == 200


def test_make_app_with_empty_secret_returns_503_on_chat() -> None:
    """Misconfigured agent (no secret) returns 503 — never silently accepts."""
    agent = _EchoAgent(jwt_secret="")
    resp = _client(agent).post(
        "/chat", json={"message": "hi"}, headers=_bearer("p1")
    )
    assert resp.status_code == 503


def test_make_app_refuses_to_start_with_weak_secret_in_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ENV", "production")
    agent = _EchoAgent(jwt_secret="change-me")
    with pytest.raises(RuntimeError):
        make_app(agent, service_name="echo_agent")
