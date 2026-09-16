from datetime import timedelta
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import pyotp
import pytest
from app.config import settings
from app.models import PartnerHandoff, User
from app.services import auth_service as auth
from cryptography.fernet import Fernet
from pydantic import SecretStr
from sqlalchemy import select

pytestmark = pytest.mark.asyncio
SECRET = "local-handoff-test-server-secret-2026"
STATE = "a" * 32


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(settings, "partner_handoff_secret", SecretStr(SECRET))
    monkeypatch.setattr(settings, "partner_web_origin", "http://127.0.0.1:3003")
    monkeypatch.setattr(settings, "partner_return_uris", "medapp://onboarding-status")


async def account(client, suffix="owner"):
    email = f"handoff-{suffix}@example.com"
    created = await client.post(
        "/auth/signup",
        json={
            "email": email,
            "password": "Password123!",
            "first_name": "Ama",
            "last_name": "Mensah",
        },
    )
    assert created.status_code == 201, created.text
    signed = await client.post(
        "/auth/login",
        json={"email": email, "password": "Password123!"},
        headers={"X-Device-Id": "mobile-install"},
    )
    assert signed.status_code == 200, signed.text
    return signed.json()


def headers(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}", "X-Device-Id": "mobile-install"}


async def start(client, tokens, **extra):
    return await client.post(
        "/auth/partner-handoffs",
        headers=headers(tokens),
        json={"return_uri": "medapp://onboarding-status", "return_state": STATE, **extra},
    )


def code(response):
    assert response.status_code == 200, response.text
    return parse_qs(urlsplit(response.json()["url"]).fragment)["code"][0]


async def exchange(client, raw, stage="redeem", secret=SECRET):
    return await client.post(
        f"/auth/partner-handoffs/{stage}",
        json={"code": raw},
        headers={"X-Partner-Handoff-Secret": secret},
    )


async def test_handoff_mints_a_distinct_session_and_no_tokens_in_url(client, db):
    source = await account(client)
    application_id = str(uuid4())
    issued = await start(client, source, application_id=application_id)
    raw = code(issued)
    assert urlsplit(issued.json()["url"]).query == ""
    assert source["access_token"] not in issued.text and source["refresh_token"] not in issued.text
    record = await db.scalar(select(PartnerHandoff))
    assert record.token_hash == auth._hash_token(raw) and raw not in str(record.__dict__)
    preview = await exchange(client, raw, "inspect")
    assert preview.status_code == 200 and preview.json()["email"] == "handoff-owner@example.com"
    assert "tokens" not in preview.json()
    redeemed = await exchange(client, raw)
    assert redeemed.status_code == 200, redeemed.text
    body = redeemed.json()
    assert body["destination"] == f"/applications/{application_id}/details"
    assert body["return_url"] == f"medapp://onboarding-status?handoff_state={STATE}"
    mobile = auth.decode_access_token(source["access_token"])
    web = auth.decode_access_token(body["tokens"]["access_token"])
    assert (
        web["sid"] != mobile["sid"]
        and web["sub"] == mobile["sub"]
        and web["role"] == mobile["role"]
    )
    assert redeemed.headers["cache-control"] == "no-store"
    # Consuming or rotating the website credential does not consume the mobile credential.
    assert (
        await client.post(
            "/auth/refresh",
            json={"refresh_token": source["refresh_token"]},
            headers={"X-Device-Id": "mobile-install"},
        )
    ).status_code == 200
    assert (await exchange(client, raw)).status_code == 410
    assert (await exchange(client, raw, "inspect")).status_code == 410


@pytest.mark.parametrize("reason", ["logout", "expired", "inactive", "password", "cancel"])
async def test_invalidated_source_or_ticket_cannot_create_web_session(client, db, reason):
    tokens = await account(client)
    issued = await start(client, tokens)
    raw = code(issued)
    if reason == "logout":
        await client.post("/auth/logout", json={"refresh_token": tokens["refresh_token"]})
    elif reason == "cancel":
        assert (
            await client.delete(
                f"/auth/partner-handoffs/{issued.json()['handoff_id']}", headers=headers(tokens)
            )
        ).status_code == 204
    else:
        record = await db.scalar(select(PartnerHandoff))
        user = await db.get(User, record.user_id)
        if reason == "expired":
            record.expires_at = auth._now() - timedelta(seconds=1)
        elif reason == "inactive":
            user.is_active = False
        else:
            user.password_hash = "changed-password-hash"
        await db.commit()
    assert (await exchange(client, raw)).status_code == 410


async def test_refresh_rotation_preserves_live_source_proof(client):
    tokens = await account(client)
    raw = code(await start(client, tokens))
    assert (
        await client.post(
            "/auth/refresh",
            json={"refresh_token": tokens["refresh_token"]},
            headers={"X-Device-Id": "mobile-install"},
        )
    ).status_code == 200
    assert (await exchange(client, raw)).status_code == 200


async def test_other_account_cannot_cancel_and_browser_cannot_redeem_directly(client):
    tokens = await account(client)
    other = await account(client, "other")
    issued = await start(client, tokens)
    raw = code(issued)
    await client.delete(
        f"/auth/partner-handoffs/{issued.json()['handoff_id']}", headers=headers(other)
    )
    assert (await exchange(client, raw, secret="wrong")).status_code == 403
    assert (await exchange(client, raw)).status_code == 200


@pytest.mark.parametrize(
    "return_uri",
    [
        "https://evil.example/onboarding-status",
        "medapp://onboarding-status?role=doctor",
        "medapp://practitioner-home",
        "javascript:alert(1)",
        "http://127.0.0.1:8800/onboarding-status",
        "http://[invalid",
    ],
)
async def test_return_requires_exact_configured_destination(client, return_uri):
    assert (await start(client, await account(client), return_uri=return_uri)).status_code == 400


async def test_revoked_or_wrong_device_bearer_cannot_mint_proof(client):
    tokens = await account(client)
    wrong = await client.post(
        "/auth/partner-handoffs",
        headers={**headers(tokens), "X-Device-Id": "other"},
        json={"return_uri": "medapp://onboarding-status", "return_state": STATE},
    )
    assert wrong.status_code == 401
    await client.post("/auth/logout", json={"refresh_token": tokens["refresh_token"]})
    assert (await start(client, tokens)).status_code == 401


async def test_disabled_handoff_is_explicit(client, monkeypatch):
    tokens = await account(client)
    monkeypatch.setattr(settings, "partner_handoff_secret", None)
    assert (await start(client, tokens)).status_code == 503


async def test_mfa_enrollment_invalidates_old_proofs_and_verified_login_can_handoff(
    client, monkeypatch
):
    monkeypatch.setattr(settings, "mfa_encryption_key", SecretStr(Fernet.generate_key().decode()))
    source = await account(client)
    raw = code(await start(client, source))
    setup = await client.post(
        "/me/two-factor/setup", headers=headers(source), json={"current_password": "Password123!"}
    )
    assert setup.status_code == 200, setup.text
    draft = setup.json()
    confirmed = await client.post(
        "/me/two-factor/confirm",
        headers=headers(source),
        json={"setup_id": draft["setup_id"], "code": pyotp.TOTP(draft["secret"]).now()},
    )
    assert confirmed.status_code == 204, confirmed.text
    assert (await exchange(client, raw)).status_code == 410
    challenge = await client.post(
        "/auth/login",
        headers={"X-Device-Id": "mobile-install"},
        json={"email": "handoff-owner@example.com", "password": "Password123!"},
    )
    assert challenge.json()["mfa_required"] is True
    verified = await client.post(
        "/auth/two-factor/verify",
        headers={"X-Device-Id": "mobile-install"},
        json={
            "challenge_token": challenge.json()["challenge_token"],
            "code": draft["recovery_codes"][0],
        },
    )
    assert verified.status_code == 200, verified.text
    assert (await exchange(client, code(await start(client, verified.json())))).status_code == 200


async def test_throttle_is_per_owner_and_keeps_consumed_attempts(client):
    tokens = await account(client)
    for _ in range(10):
        issued = await start(client, tokens)
        code(issued)
        await client.delete(
            f"/auth/partner-handoffs/{issued.json()['handoff_id']}", headers=headers(tokens)
        )
    assert (await start(client, tokens)).status_code == 429
    assert (await start(client, await account(client, "other"))).status_code == 200
