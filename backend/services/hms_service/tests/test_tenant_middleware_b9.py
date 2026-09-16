"""Audit finding B-9 regression: HMS tenant context must be staff-verified.

Without this check, any holder of a valid HMS-signed JWT could mint a
token with ``hospital_id=<any-other-tenant>`` and read that tenant's
data through any route that depends on ``get_tenant_db`` (since the
middleware would silently bind the JWT-supplied id to
``tenant_context_var``).

These tests pin the middleware-layer contract independently of which
routes happen to depend on ``get_hms_principal`` today — the defense
must hold even if a future route forgets the principal dep.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt as pyjwt
import pytest
from app import deps as hms_deps
from app.config import settings
from app.middleware import TenantContextMiddleware
from app.tenant import tenant_context_var
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient


def _sign(sub: str, hospital_id: str) -> str:
    now = datetime.now(tz=UTC)
    payload = {
        "sub": sub,
        "role": "user",
        "hospital_id": hospital_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=5)).timestamp()),
    }
    secret = settings.jwt_secret
    if not settings.dev_mode:
        payload.update(
            role="hms_staff",
            typ="access",
            aud=settings.workspace_session_audience,
            iss=settings.workspace_session_issuer,
        )
        secret = settings.workspace_session_secret.get_secret_value()
    return pyjwt.encode(payload, secret, algorithm="HS256")


def _probe_app() -> FastAPI:
    """A minimal app whose only route reports what the middleware bound."""
    app = FastAPI()
    app.add_middleware(TenantContextMiddleware)

    @app.get("/v1/probe")
    async def probe():
        return {"tenant": tenant_context_var.get()}

    return app


async def _probe(token: str) -> dict:
    transport = ASGITransport(app=_probe_app())
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/v1/probe", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.fixture()
def prod_mode(monkeypatch: pytest.MonkeyPatch):
    """Force production semantics — the dev_mode shortcut is bypassed."""
    monkeypatch.setattr(settings, "dev_mode", False)


async def test_unverified_user_does_not_bind_tenant_context(
    prod_mode, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Token with hospital_id=B for a user who has NO active staff role
    must leave the tenant context unset."""

    async def _no_role(_user_id: str, _tenant_id: str) -> str | None:
        return None

    monkeypatch.setattr(hms_deps, "_resolve_hms_role", _no_role)

    token = _sign(sub=str(uuid4()), hospital_id=str(uuid4()))
    body = await _probe(token)
    assert body["tenant"] is None


async def test_verified_user_binds_tenant_context(
    prod_mode, monkeypatch: pytest.MonkeyPatch
) -> None:
    """When the (user, hospital_id) pair maps to an active staff row,
    the middleware binds the JWT-supplied hospital_id."""
    tenant = str(uuid4())

    async def _has_role(_user_id: str, _tenant_id: str) -> str | None:
        return "doctor"

    monkeypatch.setattr(hms_deps, "_resolve_hms_role", _has_role)

    token = _sign(sub=str(uuid4()), hospital_id=tenant)
    body = await _probe(token)
    assert body["tenant"] == tenant


async def test_cross_tenant_pivot_attempt_is_blocked(
    prod_mode, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A user who is staff at A but mints a token claiming hospital_id=B
    must not be bound to B. Mirrors the actual exploit scenario from B-9.
    """
    tenant_a = str(uuid4())
    tenant_b = str(uuid4())
    staff_user = str(uuid4())

    async def _staff_at_a_only(user_id: str, tenant_id: str) -> str | None:
        if user_id == staff_user and tenant_id == tenant_a:
            return "doctor"
        return None

    monkeypatch.setattr(hms_deps, "_resolve_hms_role", _staff_at_a_only)

    forged = _sign(sub=staff_user, hospital_id=tenant_b)
    body = await _probe(forged)
    assert body["tenant"] is None

    legit = _sign(sub=staff_user, hospital_id=tenant_a)
    body = await _probe(legit)
    assert body["tenant"] == tenant_a


async def test_dev_mode_skips_staff_verification(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """dev_mode is gated by HMS_DEV_MODE (production refuses to boot with
    it on — see B-4). Inside that gate, the middleware trusts the claim
    so local dev tokens from dev_auth don't have to seed staff rows."""
    monkeypatch.setattr(settings, "dev_mode", True)

    async def _explode(_user_id: str, _tenant_id: str) -> str | None:
        raise AssertionError("dev_mode must not hit the mgmt DB")

    monkeypatch.setattr(hms_deps, "_resolve_hms_role", _explode)

    tenant = str(uuid4())
    token = _sign(sub=str(uuid4()), hospital_id=tenant)
    body = await _probe(token)
    assert body["tenant"] == tenant


async def test_missing_subject_does_not_bind_tenant(
    prod_mode, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A token without ``sub`` cannot be verified — middleware must leave
    the context unset rather than fall back to trusting hospital_id."""
    now = datetime.now(tz=UTC)
    payload = {
        "hospital_id": str(uuid4()),
        "role": "hms_staff",
        "typ": "access",
        "aud": settings.workspace_session_audience,
        "iss": settings.workspace_session_issuer,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=5)).timestamp()),
    }
    token = pyjwt.encode(
        payload, settings.workspace_session_secret.get_secret_value(), algorithm="HS256"
    )

    async def _explode(_user_id: str, _tenant_id: str) -> str | None:
        raise AssertionError("verification must not run without a subject")

    monkeypatch.setattr(hms_deps, "_resolve_hms_role", _explode)

    transport = ASGITransport(app=_probe_app())
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/v1/probe", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["tenant"] is None
