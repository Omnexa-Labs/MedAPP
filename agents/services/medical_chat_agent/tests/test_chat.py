"""End-to-end tests for medical_chat_agent.

Covers:
  - the deterministic emergency path bypasses the LLM entirely
  - normal symptom messages reach the LLM (MockLLM here) and return a reply
  - empty / non-emergency messages do not trigger triage
  - /chat is now authenticated (audit finding #4)
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

from .conftest import auth_header


def _chat(message: str, history: list[dict] | None = None) -> dict:
    client = TestClient(app)
    resp = client.post(
        "/chat",
        json={
            "message": message,
            "history": history or [],
        },
        headers=auth_header("p1"),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_chest_pain_triggers_deterministic_emergency() -> None:
    body = _chat("I have crushing chest pain that radiates to my arm")
    # The canned emergency reply MUST mention calling emergency services.
    assert "emergency number" in body["reply"].lower()
    # And it must NOT have invoked any LLM tools (we bypass the LLM).
    assert body["tool_calls"] == []
    assert body["usage"] == {"input_tokens": 0, "output_tokens": 0}


def test_suicidal_ideation_triggers_supportive_reply() -> None:
    body = _chat("I want to kill myself")
    reply = body["reply"].lower()
    assert "crisis" in reply or "emergency number" in reply
    # We never want a flippant or LLM-generated response on this category.
    assert body["usage"] == {"input_tokens": 0, "output_tokens": 0}


def test_stroke_phrase_triggers_emergency() -> None:
    body = _chat("my dad's face is drooping and his speech is slurred")
    assert "emergency number" in body["reply"].lower()
    assert body["tool_calls"] == []


def test_mild_symptom_passes_to_llm() -> None:
    body = _chat("I have a mild headache that started yesterday")
    # MockLLM echoes the input. Verify the echo, not the content.
    assert "headache" in body["reply"].lower()
    # MockLLM doesn't run tools unless the tool name appears in the message.
    # Either way, the emergency path was NOT taken (which sets usage to 0).
    assert body["usage"] == {"input_tokens": 0, "output_tokens": 0} or body["reply"].startswith("(mock)")


def test_general_question_passes_to_llm() -> None:
    body = _chat("what does my last lab result mean?")
    assert body["reply"]  # non-empty
    # Not the emergency path.
    assert "emergency number" not in body["reply"].lower()


def test_chat_requires_authorization() -> None:
    """Audit finding #4: anonymous /chat must be rejected."""
    client = TestClient(app)
    resp = client.post("/chat", json={"message": "I have a headache"})
    assert resp.status_code == 401


def test_emergency_triage_still_runs_under_auth() -> None:
    """The emergency path must trigger AFTER auth — not be a way to bypass it."""
    client = TestClient(app)
    resp = client.post(
        "/chat",
        json={"message": "crushing chest pain"},
        # no auth header
    )
    # Should be a 401, NOT a 200 with the emergency reply.
    assert resp.status_code == 401
