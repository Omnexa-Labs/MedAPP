from datetime import UTC, datetime, timedelta

import pytest
from app.config import settings
from app.deps import get_email_notifier
from app.main import app
from app.models import PasswordResetToken, User
from app.services.notifiers import EmailDeliveryError
from sqlalchemy import select

pytestmark = pytest.mark.asyncio


async def test_forgot_returns_202_even_for_unknown_email(client):
    r = await client.post("/auth/password/forgot", json={"email": "nope@nope.com"})
    assert r.status_code == 202


async def test_change_password_then_login_with_new(client):
    await client.post(
        "/auth/signup",
        json={
            "email": "a@b.com",
            "password": "password123",
            "first_name": "T",
            "last_name": "U",
        },
    )
    r = await client.post("/auth/login", json={"email": "a@b.com", "password": "password123"})
    token = r.json()["access_token"]

    r = await client.post(
        "/auth/password/change",
        headers={"authorization": f"Bearer {token}"},
        json={"current_password": "password123", "new_password": "newpassword456"},
    )
    assert r.status_code == 204

    # Old password fails
    r = await client.post("/auth/login", json={"email": "a@b.com", "password": "password123"})
    assert r.status_code == 401

    # New one works
    r = await client.post("/auth/login", json={"email": "a@b.com", "password": "newpassword456"})
    assert r.status_code == 200


async def test_change_password_wrong_current_is_400(client):
    await client.post(
        "/auth/signup",
        json={
            "email": "a@b.com",
            "password": "password123",
            "first_name": "T",
            "last_name": "U",
        },
    )
    r = await client.post("/auth/login", json={"email": "a@b.com", "password": "password123"})
    token = r.json()["access_token"]

    r = await client.post(
        "/auth/password/change",
        headers={"authorization": f"Bearer {token}"},
        json={"current_password": "WRONG", "new_password": "newpassword456"},
    )
    assert r.status_code == 400


async def register_patient(client):
    response = await client.post(
        "/auth/signup",
        json={
            "email": "recovery@example.com",
            "password": "oldpassword123",
            "first_name": "Recovery",
            "last_name": "Patient",
        },
    )
    assert response.status_code == 201


def delivered_code(notifier):
    return notifier.emails[-1]["body"].split("\n\n")[1]


async def test_recovery_changes_password_consumes_code_and_revokes_refresh(client, notifier):
    await register_patient(client)
    login = await client.post(
        "/auth/login", json={"email": "recovery@example.com", "password": "oldpassword123"}
    )
    refresh_token = login.json()["refresh_token"]
    known = await client.post("/auth/password/forgot", json={"email": "recovery@example.com"})
    unknown = await client.post("/auth/password/forgot", json={"email": "unknown@example.com"})
    assert known.status_code == unknown.status_code == 202
    assert (
        known.json()
        == unknown.json()
        == {"status": "ok", "resend_after_seconds": settings.password_reset_resend_cooldown_seconds}
    )
    assert len(notifier.emails) == 1
    payload = {"token": delivered_code(notifier), "new_password": "newpassword456"}
    reset = await client.post("/auth/password/reset", json=payload)
    assert reset.status_code == 200
    assert (await client.post("/auth/password/reset", json=payload)).status_code == 400
    assert (
        await client.post(
            "/auth/login", json={"email": "recovery@example.com", "password": "oldpassword123"}
        )
    ).status_code == 401
    assert (
        await client.post(
            "/auth/login", json={"email": "recovery@example.com", "password": "newpassword456"}
        )
    ).status_code == 200
    assert (
        await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    ).status_code == 401


async def test_forgot_cooldown_suppresses_duplicates_then_allows_resend(client, notifier, db):
    await register_patient(client)
    for _ in range(2):
        assert (
            await client.post("/auth/password/forgot", json={"email": "recovery@example.com"})
        ).status_code == 202
    assert len(notifier.emails) == 1
    record = await db.scalar(select(PasswordResetToken))
    record.created_at = datetime.now(UTC) - timedelta(minutes=10)
    await db.commit()
    await client.post("/auth/password/forgot", json={"email": "recovery@example.com"})
    assert len(notifier.emails) == 2
    assert notifier.emails[0]["body"] != notifier.emails[1]["body"]


@pytest.mark.parametrize("condition", ["expired", "inactive", "incorrect"])
async def test_reset_rejects_unusable_code(client, notifier, db, condition):
    await register_patient(client)
    await client.post("/auth/password/forgot", json={"email": "recovery@example.com"})
    code = delivered_code(notifier)
    if condition == "expired":
        record = await db.scalar(select(PasswordResetToken))
        record.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    elif condition == "inactive":
        user = await db.scalar(select(User))
        user.is_active = False
    else:
        code = "incorrect-code"
    await db.commit()
    response = await client.post(
        "/auth/password/reset", json={"token": code, "new_password": "newpassword456"}
    )
    assert response.status_code == 400
    record = await db.scalar(select(PasswordResetToken))
    assert record.consumed_at is None


async def test_delivery_failure_does_not_reveal_account(client):
    await register_patient(client)

    class UnavailableNotifier:
        async def send(self, **kwargs):
            raise EmailDeliveryError("email delivery failed")

    app.dependency_overrides[get_email_notifier] = UnavailableNotifier
    known = await client.post("/auth/password/forgot", json={"email": "recovery@example.com"})
    unknown = await client.post("/auth/password/forgot", json={"email": "unknown@example.com"})
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()


async def test_unconfigured_email_returns_unavailable_for_every_account(client, monkeypatch):
    await register_patient(client)
    monkeypatch.setattr(settings, "smtp_host", "")
    app.dependency_overrides.pop(get_email_notifier)
    for email in ["recovery@example.com", "unknown@example.com"]:
        response = await client.post("/auth/password/forgot", json={"email": email})
        assert response.status_code == 503
