"""Biometric Step 2: device-bound refresh tokens.

X-Device-Id pins a refresh token to the install it was issued for. A
token exfiltrated from a backup cannot be replayed from a different
install. Legacy rows (NULL device_id) are grandfathered so old mobile
builds keep working during rollout.
"""
from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import RefreshToken, AuditLog

pytestmark = pytest.mark.asyncio


async def _signup(client):
    return await client.post(
        "/auth/signup",
        json={
            "email": "device@example.com",
            "password": "password123",
            "first_name": "Dev",
            "last_name": "Ice",
        },
    )


async def _login(client, *, device_id: str | None = None):
    headers = {"X-Device-Id": device_id} if device_id else {}
    return await client.post(
        "/auth/login",
        json={"email": "device@example.com", "password": "password123"},
        headers=headers,
    )


# ── Legacy back-compat ────────────────────────────────────────────────────


async def test_legacy_login_without_device_id_records_null(client, session_factory):
    """Mobile builds that don't yet send X-Device-Id must still work and
    leave device_id NULL on the row."""
    await _signup(client)
    r = await _login(client)
    assert r.status_code == 200

    async with session_factory() as session:
        rows = (await session.scalars(select(RefreshToken))).all()
        assert len(rows) == 1
        assert rows[0].device_id is None


async def test_legacy_null_row_refresh_without_header_succeeds(client, session_factory):
    """Legacy refresh tokens (no device_id recorded) keep working —
    refresh without an X-Device-Id header succeeds during rollout."""
    await _signup(client)
    login = await _login(client)
    refresh_token = login.json()["refresh_token"]

    r = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert r.status_code == 200


# ── New issuance + binding ───────────────────────────────────────────────


async def test_login_with_device_id_persists_it(client, session_factory):
    await _signup(client)
    r = await _login(client, device_id="install-1234")
    assert r.status_code == 200

    async with session_factory() as session:
        rows = (await session.scalars(select(RefreshToken))).all()
        assert len(rows) == 1
        assert rows[0].device_id == "install-1234"


async def test_matched_device_id_refresh_succeeds(client):
    await _signup(client)
    login = await _login(client, device_id="install-A")
    refresh_token = login.json()["refresh_token"]

    r = await client.post(
        "/auth/refresh",
        json={"refresh_token": refresh_token},
        headers={"X-Device-Id": "install-A"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["refresh_token"] != refresh_token


async def test_mismatched_device_id_refresh_returns_401(client):
    """The exploit scenario: refresh token issued for install A is
    replayed from install B. Must 401 with the chain revoked."""
    await _signup(client)
    login = await _login(client, device_id="install-A")
    refresh_token = login.json()["refresh_token"]

    bad = await client.post(
        "/auth/refresh",
        json={"refresh_token": refresh_token},
        headers={"X-Device-Id": "install-B"},
    )
    assert bad.status_code == 401

    # Chain revoked: even the LEGITIMATE install can no longer use that
    # token — we don't know which side was compromised so we kill both.
    legit = await client.post(
        "/auth/refresh",
        json={"refresh_token": refresh_token},
        headers={"X-Device-Id": "install-A"},
    )
    assert legit.status_code == 401


async def test_refresh_with_missing_header_when_row_has_device_id_returns_401(client):
    """A row issued WITH a device_id requires the header on subsequent
    refreshes — missing header is a mismatch."""
    await _signup(client)
    login = await _login(client, device_id="install-A")
    refresh_token = login.json()["refresh_token"]

    r = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert r.status_code == 401


# ── Legacy upgrade path ──────────────────────────────────────────────────


async def test_legacy_row_first_refresh_with_header_starts_binding(
    client, session_factory
):
    """User on an old build (no device_id) updates the app, logs in via
    biometric: the first refresh with X-Device-Id stamps the new chain.
    Subsequent refreshes from a DIFFERENT install are now rejected."""
    await _signup(client)
    login = await _login(client)  # no header — legacy path
    legacy_refresh = login.json()["refresh_token"]

    rotated = await client.post(
        "/auth/refresh",
        json={"refresh_token": legacy_refresh},
        headers={"X-Device-Id": "install-A"},
    )
    assert rotated.status_code == 200

    # New token is now bound to install-A.
    async with session_factory() as session:
        rows = (
            await session.scalars(
                select(RefreshToken).where(RefreshToken.revoked_at.is_(None))
            )
        ).all()
        assert len(rows) == 1
        assert rows[0].device_id == "install-A"

    # Attempt from a different install must 401.
    new_refresh = rotated.json()["refresh_token"]
    r = await client.post(
        "/auth/refresh",
        json={"refresh_token": new_refresh},
        headers={"X-Device-Id": "install-B"},
    )
    assert r.status_code == 401


# ── Biometric audit ──────────────────────────────────────────────────────


async def test_biometric_flag_writes_audit_row(client, session_factory):
    """Setting `biometric: true` on the refresh body emits a
    user.biometric_login audit row in the same transaction. (The
    domain event publish is also triggered but rabbit is offline in
    tests; the audit row is the durable record.)"""
    await _signup(client)
    login = await _login(client, device_id="install-bio")
    refresh_token = login.json()["refresh_token"]

    r = await client.post(
        "/auth/refresh",
        json={"refresh_token": refresh_token, "biometric": True},
        headers={"X-Device-Id": "install-bio"},
    )
    assert r.status_code == 200

    async with session_factory() as session:
        rows = (
            await session.scalars(
                select(AuditLog).where(AuditLog.action == "user.biometric_login")
            )
        ).all()
        assert len(rows) == 1
        assert rows[0].meta == {"device_id": "install-bio"}


async def test_non_biometric_refresh_does_not_audit_biometric(client, session_factory):
    """Plain refresh (biometric=false / omitted) must NOT generate a
    biometric_login audit row."""
    await _signup(client)
    login = await _login(client, device_id="install-A")
    refresh_token = login.json()["refresh_token"]

    r = await client.post(
        "/auth/refresh",
        json={"refresh_token": refresh_token},
        headers={"X-Device-Id": "install-A"},
    )
    assert r.status_code == 200

    async with session_factory() as session:
        rows = (
            await session.scalars(
                select(AuditLog).where(AuditLog.action == "user.biometric_login")
            )
        ).all()
        assert len(rows) == 0
