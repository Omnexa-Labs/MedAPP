"""Signup-time OTP verification (phone OR email).

User picks a channel → /auth/otp/signup-start sends the code → user
enters it → /auth/otp/signup-verify returns a short-lived JWT → /auth/signup
consumes the JWT and marks the matching contact verified.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.config import settings
from app.models import OtpCode, User
from app.services.notifiers import EmailDeliveryError

pytestmark = pytest.mark.asyncio


async def test_email_start_returns_distinct_expiry_and_resend_delays(client, monkeypatch):
    monkeypatch.setattr(settings, "otp_ttl_seconds", 120)
    monkeypatch.setattr(settings, "otp_resend_cooldown_seconds", 17)
    response = await _start(client, channel="email", recipient="timers@example.com")
    assert response.status_code == 200
    assert response.json() == {"sent": True, "expires_in": 120, "resend_after_seconds": 17}
    repeated = await _start(client, channel="email", recipient="timers@example.com")
    assert repeated.status_code == 429


async def test_expired_email_code_cannot_verify(client, notifier, session_factory):
    recipient = "expired@example.com"
    assert (await _start(client, channel="email", recipient=recipient)).status_code == 200
    code = _extract_code(notifier.emails[-1]["body"])
    async with session_factory() as session:
        record = await session.scalar(select(OtpCode).where(OtpCode.recipient == recipient))
        record.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        await session.commit()
    assert (await _verify(client, channel="email", recipient=recipient, code=code)).status_code == 400


async def test_wrong_email_codes_consume_the_attempt_budget(client, notifier, session_factory):
    recipient = "attempts@example.com"
    assert (await _start(client, channel="email", recipient=recipient)).status_code == 200
    code = _extract_code(notifier.emails[-1]["body"])
    wrong = "000000" if code != "000000" else "111111"
    for attempt in range(1, settings.otp_max_attempts + 1):
        response = await _verify(client, channel="email", recipient=recipient, code=wrong)
        assert response.status_code == 400
        async with session_factory() as session:
            record = await session.scalar(select(OtpCode).where(OtpCode.recipient == recipient))
            assert record.attempts == attempt
    response = await _verify(client, channel="email", recipient=recipient, code=code)
    assert response.status_code == 400
    assert "verification_token" not in response.json()


async def test_consuming_a_new_code_does_not_reactivate_an_older_code(client, notifier, session_factory):
    recipient = "resend@example.com"
    assert (await _start(client, channel="email", recipient=recipient)).status_code == 200
    old_code = _extract_code(notifier.emails[-1]["body"])
    async with session_factory() as session:
        previous = await session.scalar(select(OtpCode).where(OtpCode.recipient == recipient))
        previous.created_at = datetime.now(timezone.utc) - timedelta(seconds=settings.otp_resend_cooldown_seconds + 1)
        await session.commit()
    assert (await _start(client, channel="email", recipient=recipient)).status_code == 200
    current_code = _extract_code(notifier.emails[-1]["body"])
    assert (await _verify(client, channel="email", recipient=recipient, code=current_code)).status_code == 200
    assert (await _verify(client, channel="email", recipient=recipient, code=old_code)).status_code == 400


@pytest.mark.parametrize("delivery_error", [OSError, EmailDeliveryError])
async def test_delivery_failure_returns_unavailable_and_allows_retry(
    client, notifier, monkeypatch, delivery_error
):
    async def fail_delivery(**kwargs):
        raise delivery_error("SMTP connection failed")

    with monkeypatch.context() as patch:
        patch.setattr(notifier, "send_email", fail_delivery)
        response = await _start(client, channel="email", recipient="retry@example.com")
        assert response.status_code == 503
    response = await _start(client, channel="email", recipient="retry@example.com")
    assert response.status_code == 200
    assert len(notifier.emails) == 1


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
