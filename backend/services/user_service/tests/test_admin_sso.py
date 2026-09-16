from datetime import timedelta
from uuid import UUID

import pytest
from app.config import settings
from app.models import AuditLog, ProviderAttempt, ProviderIdentity, User
from app.services import auth_service as auth
from cryptography.fernet import Fernet
from pydantic import SecretStr
from sqlalchemy import delete, select
from test_provider_auth import signer as provider_signer
from test_two_factor import PASSWORD, account, enable

pytestmark = pytest.mark.asyncio
signer = provider_signer
HEADERS = {"X-Device-Id": "admin-browser"}


@pytest.fixture(autouse=True)
def admin_configuration(monkeypatch):
    monkeypatch.setattr(settings, "admin_google_client_id", "qa-admin-client")
    monkeypatch.setattr(settings, "admin_workspace_domains", "clinic.example")
    monkeypatch.setattr(settings, "mfa_encryption_key", SecretStr(Fernet.generate_key().decode()))


async def administrator(client, session_factory, *, role="platform_admin", linked=True):
    user, _, headers = await account(client, email="reviewer@clinic.example")
    async with session_factory() as db:
        record = await db.get(User, UUID(user["id"]))
        record.role = role
        record.email_verified = True
        if linked:
            db.add(
                ProviderIdentity(user_id=record.id, provider="google", subject="provider-subject")
            )
        await db.commit()
    return user, headers


async def proof(client, signer, **claims):
    response = await client.post("/auth/admin-sso/begin", headers=HEADERS)
    assert response.status_code == 200, response.text
    challenge = response.json()
    defaults = {
        "aud": "qa-admin-client",
        "hd": "clinic.example",
        "email": "reviewer@clinic.example",
    }
    return {
        "challenge_token": challenge["challenge_token"],
        "identity_token": signer(challenge["nonce"], **{**defaults, **claims}),
    }


async def finish(client, wire, headers=HEADERS):
    return await client.post("/auth/admin-sso/complete", headers=headers, json=wire)


async def test_workspace_subject_login_is_single_use_audited_and_device_bound(
    client, session_factory, db, signer
):
    user, _ = await administrator(client, session_factory)
    wire = await proof(client, signer)
    response = await finish(client, wire)
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    tokens = response.json()
    me = await client.get("/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert me.json()["id"] == user["id"] and me.json()["role"] == "platform_admin"
    assert (await finish(client, wire)).status_code == 401
    assert (
        len(
            (
                await db.scalars(select(AuditLog).where(AuditLog.action == "admin_sso.succeeded"))
            ).all()
        )
        == 1
    )
    assert (
        await client.post(
            "/auth/refresh",
            headers={"X-Device-Id": "other"},
            json={"refresh_token": tokens["refresh_token"]},
        )
    ).status_code == 401


@pytest.mark.parametrize(
    "claims, expected",
    [
        ({"aud": "qa-google-client"}, 401),
        ({"nonce": "wrong"}, 401),
        ({"iss": "https://attacker.example"}, 401),
        ({"exp": 1}, 401),
        ({"hd": None}, 403),
        ({"hd": "elsewhere.example"}, 403),
        ({"email_verified": False}, 403),
        ({"email_verified": 1}, 403),
        ({"email": "other@clinic.example"}, 403),
        ({"email": "reviewer@gmail.com"}, 403),
        ({"sub": "unlinked-subject"}, 403),
    ],
)
async def test_wrong_provider_claims_never_issue_admin_session(
    client, session_factory, signer, claims, expected
):
    await administrator(client, session_factory)
    response = await finish(client, await proof(client, signer, **claims))
    assert response.status_code == expected, response.text
    assert "access_token" not in response.text


@pytest.mark.parametrize(
    "role, linked", [("patient", True), ("doctor", True), ("platform_admin", False)]
)
async def test_email_match_cannot_grant_or_link_an_admin(
    client, session_factory, signer, role, linked
):
    await administrator(client, session_factory, role=role, linked=linked)
    assert (await finish(client, await proof(client, signer))).status_code == 403
    async with session_factory() as db:
        assert (await db.scalar(select(User))).role == role
        assert len((await db.scalars(select(ProviderIdentity))).all()) == int(linked)


async def test_configuration_is_independent_and_fail_closed(client, monkeypatch, signer):
    monkeypatch.setattr(settings, "google_client_ids", "")
    assert (await client.get("/auth/admin-sso/config")).json()["enabled"] is True
    assert (await client.post("/auth/admin-sso/begin")).status_code == 400
    for bad_domains in ("", "*", "https://clinic.example", "clinic.example,*.example"):
        monkeypatch.setattr(settings, "admin_workspace_domains", bad_domains)
        config = await client.get("/auth/admin-sso/config")
        assert config.json() == {"enabled": False, "client_id": None, "hosted_domains": []}
        assert config.headers["cache-control"] == "no-store"
        assert (await client.post("/auth/admin-sso/begin", headers=HEADERS)).status_code == 503


async def test_admin_login_does_not_require_mobile_google_audiences(
    client, session_factory, signer, monkeypatch
):
    await administrator(client, session_factory, role="admin")
    monkeypatch.setattr(settings, "google_client_ids", "")
    response = await finish(client, await proof(client, signer))
    assert response.status_code == 200, response.text
    assert "access_token" in response.json()


async def test_password_mfa_challenge_cannot_be_used_as_admin_sso(client, session_factory):
    _, headers = await administrator(client, session_factory)
    factor = await enable(client, headers)
    login = await client.post(
        "/auth/login",
        headers=HEADERS,
        json={"email": "reviewer@clinic.example", "password": PASSWORD},
    )
    response = await client.post(
        "/auth/admin-sso/verify",
        headers=HEADERS,
        json={
            "challenge_token": login.json()["challenge_token"],
            "code": factor["recovery_codes"][0],
        },
    )
    assert response.status_code == 401, response.text
    assert "access_token" not in response.text


async def test_attempts_are_device_bound_expiring_and_not_ordinary_provider_proofs(
    client, session_factory, signer
):
    wire = await proof(client, signer)
    assert (await finish(client, wire, {"X-Device-Id": "wrong-browser"})).status_code == 401
    assert (
        await client.post("/auth/providers/complete", headers=HEADERS, json=wire)
    ).status_code == 401
    async with session_factory() as db:
        record = await db.scalar(select(ProviderAttempt))
        record.expires_at = auth._now() - timedelta(seconds=1)
        await db.commit()
    assert (await finish(client, wire)).status_code == 401
    for _ in range(10):
        assert (await client.post("/auth/admin-sso/begin", headers=HEADERS)).status_code == 200
    assert (await client.post("/auth/admin-sso/begin", headers=HEADERS)).status_code == 429


async def test_mfa_must_succeed_before_admin_tokens_are_issued(client, session_factory, db, signer):
    _, headers = await administrator(client, session_factory)
    factor = await enable(client, headers)
    wire = await proof(client, signer)
    result = await finish(client, wire)
    assert result.status_code == 200, result.text
    challenge = result.json()
    assert challenge["mfa_required"] is True and "access_token" not in challenge
    payload = {"challenge_token": challenge["challenge_token"], "code": "000000"}
    assert (
        await client.post("/auth/admin-sso/verify", headers=HEADERS, json=payload)
    ).status_code == 400
    payload["code"] = factor["recovery_codes"][0]
    response = await client.post("/auth/admin-sso/verify", headers=HEADERS, json=payload)
    assert response.status_code == 200, response.text
    assert "access_token" in response.json()
    assert (
        await client.post("/auth/admin-sso/verify", headers=HEADERS, json=payload)
    ).status_code == 401
    assert (
        len(
            (
                await db.scalars(select(AuditLog).where(AuditLog.action == "admin_sso.succeeded"))
            ).all()
        )
        == 1
    )


@pytest.mark.parametrize(
    "change", ["demoted", "inactive", "unlinked", "email_changed", "domain_removed"]
)
async def test_mfa_rechecks_current_admin_and_link_before_installing_access(
    client, session_factory, signer, monkeypatch, change
):
    user, headers = await administrator(client, session_factory)
    factor = await enable(client, headers)
    challenge = (await finish(client, await proof(client, signer))).json()
    async with session_factory() as db:
        record = await db.get(User, UUID(user["id"]))
        if change == "demoted":
            record.role = "patient"
        elif change == "inactive":
            record.is_active = False
        elif change == "unlinked":
            await db.execute(delete(ProviderIdentity))
        elif change == "email_changed":
            record.email = "changed@clinic.example"
        else:
            monkeypatch.setattr(settings, "admin_workspace_domains", "other.example")
        await db.commit()
    response = await client.post(
        "/auth/admin-sso/verify",
        headers=HEADERS,
        json={"challenge_token": challenge["challenge_token"], "code": factor["recovery_codes"][0]},
    )
    assert response.status_code == 403, response.text
    assert "access_token" not in response.text
