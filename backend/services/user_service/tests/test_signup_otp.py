"""Signup-time OTP verification (phone OR email).

User picks a channel → /auth/otp/signup-start sends the code → user
enters it → /auth/otp/signup-verify returns a short-lived JWT → /auth/signup
consumes the JWT and marks the matching contact verified.
"""
from __future__ import annotations

import re

import pytest
from sqlalchemy import select

from app.models import User

pytestmark = pytest.mark.asyncio


def _extract_code(body: str) -> str:
    """Both SMS and email bodies contain "code: 123456" — pull the digits."""
    m = re.search(r"\b(\d{6})\b", body)
    assert m is not None, f"no 6-digit code in body: {body!r}"
    return m.group(1)


async def _start(client, *, channel: str, recipient: str):
    body = (
        {"channel": "sms", "phone": recipient}
        if channel == "sms"
        else {"channel": "email", "email": recipient}
    )
    return await client.post("/auth/otp/signup-start", json=body)


async def _verify(client, *, channel: str, recipient: str, code: str):
    body = (
        {"channel": "sms", "phone": recipient, "code": code}
        if channel == "sms"
        else {"channel": "email", "email": recipient, "code": code}
    )
    return await client.post("/auth/otp/signup-verify", json=body)


# ── Phone channel ────────────────────────────────────────────────────────


async def test_phone_signup_flow_end_to_end(client, notifier, session_factory):
    r = await _start(client, channel="sms", recipient="+233241234567")
    assert r.status_code == 200, r.text
    assert r.json()["sent"] is True
    assert len(notifier.sms) == 1
    code = _extract_code(notifier.sms[0]["body"])

    v = await _verify(client, channel="sms", recipient="+233241234567", code=code)
    assert v.status_code == 200, v.text
    token = v.json()["verification_token"]
    assert token

    # Use the token at signup — phone_verified must come out true.
    s = await client.post(
        "/auth/signup",
        json={
            "email": "phone-signup@example.com",
            "password": "password123",
            "first_name": "P",
            "last_name": "S",
            "phone": "+233241234567",
            "verification_token": token,
        },
    )
    assert s.status_code == 201, s.text
    async with session_factory() as session:
        user = await session.scalar(
            select(User).where(User.email == "phone-signup@example.com")
        )
        assert user is not None
        assert user.phone_verified is True
        assert user.email_verified is False  # only the verified channel flips


# ── Email channel ────────────────────────────────────────────────────────


async def test_email_signup_flow_end_to_end(client, notifier, session_factory):
    r = await _start(client, channel="email", recipient="new@example.com")
    assert r.status_code == 200, r.text
    assert len(notifier.emails) == 1
    code = _extract_code(notifier.emails[0]["body"])

    v = await _verify(client, channel="email", recipient="new@example.com", code=code)
    assert v.status_code == 200
    token = v.json()["verification_token"]

    s = await client.post(
        "/auth/signup",
        json={
            "email": "new@example.com",
            "password": "password123",
            "first_name": "E",
            "last_name": "S",
            "verification_token": token,
        },
    )
    assert s.status_code == 201
    async with session_factory() as session:
        user = await session.scalar(
            select(User).where(User.email == "new@example.com")
        )
        assert user.email_verified is True
        assert user.phone_verified is False


# ── Existing-contact rejection ───────────────────────────────────────────


async def test_signup_start_refuses_existing_email(client):
    # Pre-create a user with that email.
    await client.post(
        "/auth/signup",
        json={
            "email": "taken@example.com",
            "password": "password123",
            "first_name": "T",
            "last_name": "A",
        },
    )
    r = await _start(client, channel="email", recipient="taken@example.com")
    assert r.status_code == 409
    assert "already in use" in r.json()["detail"]


async def test_signup_start_refuses_existing_phone(client):
    await client.post(
        "/auth/signup",
        json={
            "email": "phoneuser@example.com",
            "password": "password123",
            "first_name": "P",
            "last_name": "U",
            "phone": "+233241234567",
        },
    )
    r = await _start(client, channel="sms", recipient="+233241234567")
    assert r.status_code == 409


# ── Token mismatch is silently ignored (account created unverified) ──────


async def test_signup_with_token_for_different_email_creates_unverified(
    client, notifier, session_factory
):
    """A token issued for one email pasted into a signup with a different
    email must NOT verify that email. We don't raise — accept the signup
    but leave email_verified=false. That avoids leaking "you used the
    wrong token" semantics mid-signup."""
    await _start(client, channel="email", recipient="alice@example.com")
    code = _extract_code(notifier.emails[0]["body"])
    v = await _verify(client, channel="email", recipient="alice@example.com", code=code)
    token = v.json()["verification_token"]

    s = await client.post(
        "/auth/signup",
        json={
            "email": "bob@example.com",  # different from the token's recipient
            "password": "password123",
            "first_name": "B",
            "last_name": "B",
            "verification_token": token,
        },
    )
    assert s.status_code == 201
    async with session_factory() as session:
        user = await session.scalar(
            select(User).where(User.email == "bob@example.com")
        )
        assert user.email_verified is False
        assert user.phone_verified is False


async def test_signup_without_token_creates_unverified(client, session_factory):
    """Back-compat: legacy mobile builds that don't yet send a token
    still produce a working account, just unverified."""
    s = await client.post(
        "/auth/signup",
        json={
            "email": "legacy@example.com",
            "password": "password123",
            "first_name": "L",
            "last_name": "G",
        },
    )
    assert s.status_code == 201
    async with session_factory() as session:
        user = await session.scalar(
            select(User).where(User.email == "legacy@example.com")
        )
        assert user.email_verified is False
        assert user.phone_verified is False


# ── Wrong code / expired / replay ────────────────────────────────────────


async def test_signup_verify_wrong_code_is_400(client, notifier):
    await _start(client, channel="email", recipient="wrong@example.com")
    r = await _verify(
        client, channel="email", recipient="wrong@example.com", code="000000"
    )
    assert r.status_code == 400


async def test_signup_verify_consumes_otp(client, notifier):
    """A code can be used once. Second verify with the same code fails."""
    await _start(client, channel="email", recipient="once@example.com")
    code = _extract_code(notifier.emails[0]["body"])
    ok = await _verify(client, channel="email", recipient="once@example.com", code=code)
    assert ok.status_code == 200
    again = await _verify(
        client, channel="email", recipient="once@example.com", code=code
    )
    assert again.status_code == 400


# ── Channel/contact validation ───────────────────────────────────────────


async def test_signup_start_email_channel_with_phone_field_is_422(client):
    r = await client.post(
        "/auth/otp/signup-start",
        json={"channel": "email", "phone": "+233241234567"},
    )
    assert r.status_code == 422


async def test_signup_start_sms_channel_with_email_field_is_422(client):
    r = await client.post(
        "/auth/otp/signup-start",
        json={"channel": "sms", "email": "x@y.com"},
    )
    assert r.status_code == 422


async def test_signup_start_invalid_phone_is_422(client):
    r = await client.post(
        "/auth/otp/signup-start",
        json={"channel": "sms", "phone": "0241234567"},  # missing leading +
    )
    assert r.status_code == 422
