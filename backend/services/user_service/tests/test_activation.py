from uuid import UUID, uuid4

import jwt
import pytest
from app.config import settings
from app.models import AuditLog, User
from pydantic import SecretStr
from shared.onboarding.receipts import ActivationReceipt
from sqlalchemy import func, select

PATH = "/internal/professional-activations"
SECRET = "test-user-activation-only-secret-2026"


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(settings, "onboarding_activation_secret", SecretStr(SECRET))


async def account(client):
    payload = {
        "email": "activation@example.com",
        "password": "Testing123!",
        "first_name": "Ama",
        "last_name": "Mensah",
    }
    response = await client.post("/auth/signup", json=payload)
    assert response.status_code == 201, response.text
    signed = await client.post(
        "/auth/login",
        json={"email": payload["email"], "password": payload["password"]},
        headers={"X-Device-Id": "activation-device"},
    )
    assert signed.status_code == 200, signed.text
    tokens = signed.json()
    claims = jwt.decode(
        tokens["access_token"],
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
        options={"verify_aud": False},
    )
    return {
        "application_id": str(uuid4()),
        "applicant_id": claims["sub"],
        "reviewer_id": str(uuid4()),
        "approval_version": 5,
        "role": "doctor",
        "first_name": "Ama",
        "last_name": "Mensah",
        "profile_id": str(uuid4()),
    }, tokens


async def send(client, payload, secret=SECRET):
    return await client.post(PATH, json=payload, headers={"X-Activation-Secret": secret})


async def test_organization_account_check_requires_service_auth_and_does_not_grant_role(client, session_factory):
    payload, _ = await account(client)
    endpoint = PATH + "/subjects/" + payload["applicant_id"]
    assert (await client.get(endpoint)).status_code == 401
    result = await client.get(endpoint, headers={"X-Activation-Secret": SECRET})
    assert result.status_code == 200
    assert result.json() == {"applicant_id": payload["applicant_id"], "is_active": True}
    async with session_factory() as db:
        user = await db.get(User, UUID(payload["applicant_id"]))
        assert user.role in {"user", "patient"}
        assert await db.scalar(select(func.count()).select_from(ActivationReceipt)) == 0
        user.is_active = False
        await db.commit()
    assert (await client.get(endpoint, headers={"X-Activation-Secret": SECRET})).status_code == 409
    assert (await client.get(PATH + "/subjects/" + str(uuid4()), headers={"X-Activation-Secret": SECRET})).status_code == 409


async def test_activation_is_idempotent_and_refresh_issues_new_permissions(client, session_factory):
    payload, tokens = await account(client)
    first = await send(client, payload)
    assert first.status_code == 200, first.text
    assert (await send(client, payload)).json() == first.json()
    refreshed = await client.post(
        "/auth/refresh",
        json={"refresh_token": tokens["refresh_token"]},
        headers={"X-Device-Id": "activation-device"},
    )
    assert refreshed.status_code == 200, refreshed.text
    claims = jwt.decode(
        refreshed.json()["access_token"],
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
        options={"verify_aud": False},
    )
    assert claims["role"] == "doctor"
    async with session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(ActivationReceipt)) == 1
        assert (
            await db.scalar(
                select(func.count())
                .select_from(AuditLog)
                .where(AuditLog.action == "professional.activated")
            )
            == 1
        )
        assert (await db.get(User, UUID(payload["applicant_id"]))).role == "doctor"


async def test_replay_cannot_restore_access_revoked_after_activation(client, session_factory):
    payload, _ = await account(client)
    assert (await send(client, payload)).status_code == 200
    async with session_factory() as db:
        user = await db.get(User, UUID(payload["applicant_id"]))
        user.role = "user"
        await db.commit()
    assert (await send(client, payload)).status_code == 409


@pytest.mark.parametrize(
    "role,active", [("admin", True), ("hospital_admin", True), ("nurse", True), ("user", False)]
)
async def test_conflicting_or_inactive_account_is_not_changed(
    client, session_factory, role, active
):
    payload, _ = await account(client)
    async with session_factory() as db:
        user = await db.get(User, UUID(payload["applicant_id"]))
        user.role, user.is_active = role, active
        await db.commit()
    assert (await send(client, payload)).status_code == 409
    async with session_factory() as db:
        assert (await db.get(User, UUID(payload["applicant_id"]))).role == role
        assert await db.scalar(select(func.count()).select_from(ActivationReceipt)) == 0


async def test_secret_self_review_and_conflicting_receipt_are_rejected(client, monkeypatch):
    payload, _ = await account(client)
    assert (await send(client, payload, "wrong")).status_code == 401
    assert (await send(client, {**payload, "role": "admin"})).status_code == 422
    assert (
        await send(client, {**payload, "reviewer_id": payload["applicant_id"]})
    ).status_code == 422
    assert (await send(client, payload)).status_code == 200
    assert (await send(client, {**payload, "profile_id": str(uuid4())})).status_code == 409
    monkeypatch.setattr(settings, "onboarding_activation_secret", SecretStr(""))
    assert (await send(client, payload)).status_code == 503
