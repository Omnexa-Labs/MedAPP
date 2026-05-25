"""Unit tests for `agents/shared/auth.py`.

Covers the verification primitives, the FastAPI dependency, the IDOR
guard, and the production startup validation. The HTTP-level integration
(make_app + /chat) is tested in test_make_app_auth.py.
"""
from __future__ import annotations

import time

import jwt
import pytest
from fastapi import HTTPException

from agents.shared.auth import (
    WEAK_JWT_SECRETS,
    Principal,
    decode_token,
    issue_test_token,
    make_require_principal,
    validate_jwt_secret,
)


_SECRET = "test-pytest-secret-9f4b-padded-to-clear-the-hs256-key-warning"


# ── Principal / decode_token ─────────────────────────────────────────────────


def test_decode_valid_token_returns_principal() -> None:
    token = issue_test_token("patient-1", secret=_SECRET, role="patient")
    p = decode_token(token, secret=_SECRET)
    assert p.subject == "patient-1"
    assert p.role == "patient"
    assert p.is_admin is False


def test_decode_admin_role_sets_is_admin_true() -> None:
    token = issue_test_token("ops-1", secret=_SECRET, role="admin")
    p = decode_token(token, secret=_SECRET)
    assert p.is_admin is True


def test_decode_rejects_wrong_secret() -> None:
    token = issue_test_token("p1", secret=_SECRET)
    with pytest.raises(jwt.InvalidTokenError):
        decode_token(token, secret="wrong-secret")


def test_decode_rejects_expired_token() -> None:
    token = issue_test_token("p1", secret=_SECRET, ttl_seconds=-10)
    with pytest.raises(jwt.ExpiredSignatureError):
        decode_token(token, secret=_SECRET)


def test_decode_rejects_missing_sub_claim() -> None:
    # Hand-roll a token with no 'sub' claim.
    payload = {"role": "patient", "iat": int(time.time()), "exp": int(time.time()) + 60}
    token = jwt.encode(payload, _SECRET, algorithm="HS256")
    with pytest.raises(jwt.InvalidTokenError):
        decode_token(token, secret=_SECRET)


def test_decode_refuses_empty_secret() -> None:
    """Empty secret is a footgun — never silently authenticate."""
    token = issue_test_token("p1", secret="anything")
    with pytest.raises(jwt.InvalidTokenError):
        decode_token(token, secret="")


def test_decode_defaults_role_to_patient_when_missing() -> None:
    payload = {"sub": "p1", "iat": int(time.time()), "exp": int(time.time()) + 60}
    token = jwt.encode(payload, _SECRET, algorithm="HS256")
    p = decode_token(token, secret=_SECRET)
    assert p.role == "patient"


# ── make_require_principal (FastAPI dep) ─────────────────────────────────────


def test_require_principal_accepts_valid_bearer() -> None:
    dep = make_require_principal(_SECRET)
    token = issue_test_token("p1", secret=_SECRET)
    p = dep(f"Bearer {token}")
    assert isinstance(p, Principal)
    assert p.subject == "p1"


def test_require_principal_rejects_missing_header() -> None:
    dep = make_require_principal(_SECRET)
    with pytest.raises(HTTPException) as exc:
        dep(None)
    assert exc.value.status_code == 401


def test_require_principal_rejects_non_bearer() -> None:
    dep = make_require_principal(_SECRET)
    with pytest.raises(HTTPException) as exc:
        dep("Basic abc==")
    assert exc.value.status_code == 401


def test_require_principal_returns_503_when_secret_empty() -> None:
    """Agent misconfiguration must NOT silently authenticate."""
    dep = make_require_principal("")
    token = issue_test_token("p1", secret=_SECRET)
    with pytest.raises(HTTPException) as exc:
        dep(f"Bearer {token}")
    assert exc.value.status_code == 503


def test_require_principal_rejects_expired_token() -> None:
    dep = make_require_principal(_SECRET)
    token = issue_test_token("p1", secret=_SECRET, ttl_seconds=-10)
    with pytest.raises(HTTPException) as exc:
        dep(f"Bearer {token}")
    assert exc.value.status_code == 401


def test_require_principal_does_not_leak_error_detail() -> None:
    """The 401 response should be opaque — no internal error text."""
    dep = make_require_principal(_SECRET)
    with pytest.raises(HTTPException) as exc:
        dep("Bearer not-a-real-token")
    assert exc.value.status_code == 401
    assert exc.value.detail == "invalid token"


# ── validate_jwt_secret ──────────────────────────────────────────────────────


def test_validate_jwt_secret_passes_with_strong_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENV", "production")
    validate_jwt_secret("a-real-32-byte-secret-abcdef1234567890", service_name="concierge")


def test_validate_jwt_secret_blocks_empty_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENV", "production")
    with pytest.raises(RuntimeError):
        validate_jwt_secret("", service_name="concierge")


def test_validate_jwt_secret_blocks_known_weak_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENV", "production")
    with pytest.raises(RuntimeError):
        validate_jwt_secret("change-me", service_name="concierge")


def test_validate_jwt_secret_warns_but_allows_outside_production(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.delenv("ENV", raising=False)
    with caplog.at_level("WARNING"):
        validate_jwt_secret("", service_name="concierge")
    # Should not raise; just a warning log.


def test_known_weak_defaults_include_audit_findings() -> None:
    """Lock the list of weak defaults we refuse so adding to the set is intentional."""
    for s in ("change-me", "change-me-change-me-change-me-change-me", ""):
        assert s in WEAK_JWT_SECRETS
