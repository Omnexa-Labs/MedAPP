import re
import time
from datetime import timedelta
from uuid import UUID

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy import select

from app.config import settings
from app.models import ProviderAttempt, ProviderIdentity, User
from app.services import auth_service as auth, provider_tokens
from test_two_factor import account, enable, PASSWORD

pytestmark = pytest.mark.asyncio
HEADERS = {"X-Device-Id": "provider-install"}


@pytest.fixture
def signer(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setattr(settings, "google_client_ids", "qa-google-client")
    monkeypatch.setattr(settings, "apple_client_ids", "qa.apple.bundle")
    monkeypatch.setattr(provider_tokens, "_keys", {p: (time.monotonic() + 300, {"qa": key.public_key()}) for p in ("google", "apple")})
    def sign(expected_nonce, provider="google", **overrides):
        claims = {"iss": "https://accounts.google.com" if provider == "google" else "https://appleid.apple.com",
                  "aud": "qa-google-client" if provider == "google" else "qa.apple.bundle",
                  "sub": "provider-subject", "exp": int(time.time()) + 300, "iat": int(time.time()),
                  "nonce": expected_nonce, "email": "provider@example.com", "email_verified": True, "name": "Ama Mensah"}
        claims.update(overrides)
        return jwt.encode(claims, key, algorithm="RS256", headers={"kid": "qa"})
    return sign


async def begin(client, provider="google", headers=HEADERS):
    response = await client.post("/auth/providers/begin", headers=headers, json={"provider": provider})
    assert response.status_code == 200, response.text
    return response.json()


async def finish(client, signer, provider="google", **claims):
    challenge = await begin(client, provider)
    return await client.post("/auth/providers/complete", headers=HEADERS, json={
        "challenge_token": challenge["challenge_token"], "identity_token": signer(challenge["nonce"], provider, **claims)})


async def email_proof(client, notifier, email):
    assert (await client.post("/auth/otp/signup-start", json={"channel": "email", "email": email})).status_code == 200
    code = re.search(r"\b(\d{6})\b", notifier.emails[-1]["body"]).group(1)
    response = await client.post("/auth/otp/signup-verify", json={"channel": "email", "email": email, "code": code})
    assert response.status_code == 200
    return response.json()["verification_token"]


@pytest.mark.parametrize("provider", ["google", "apple"])
async def test_signup_needs_email_proof_then_subject_login_and_replay_rejection(client, notifier, db, signer, provider):
    response = await finish(client, signer, provider)
    assert response.status_code == 200, response.text
    draft = response.json()
    assert draft["action"] == "signup_required"
    assert response.headers["cache-control"] == "no-store"
    payload = {"email": draft["email"], "password": PASSWORD, "first_name": "Ama", "last_name": "Mensah", "provider_ticket": draft["ticket"]}
    assert (await client.post("/auth/signup", headers=HEADERS, json=payload)).status_code == 400
    payload["verification_token"] = await email_proof(client, notifier, draft["email"])
    assert (await client.post("/auth/signup", headers={"X-Device-Id": "wrong"}, json=payload)).status_code == 401
    created = await client.post("/auth/signup", headers=HEADERS, json=payload)
    assert created.status_code == 201, created.text
    assert created.json()["email_verified"] is True
    assert created.json()["role"] == "user"
    identity = await db.scalar(select(ProviderIdentity))
    assert str(identity.user_id) == created.json()["id"]
    # Provider subjects remain authoritative even when email is absent or changes.
    login = await finish(client, signer, provider, email=None, email_verified=False)
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['access_token']}", **HEADERS}
    assert (await client.get("/me", headers=headers)).json()["id"] == created.json()["id"]
    listing = await client.get("/me/providers", headers=headers)
    assert [x["provider"] for x in listing.json()["items"]] == [provider]
    assert "subject" not in listing.text and "ticket" not in listing.text
    # A completed native proof can never be exchanged twice.
    challenge = await begin(client, provider)
    wire = {"challenge_token": challenge["challenge_token"], "identity_token": signer(challenge["nonce"], provider)}
    assert (await client.post("/auth/providers/complete", headers=HEADERS, json=wire)).status_code == 200
    assert (await client.post("/auth/providers/complete", headers=HEADERS, json=wire)).status_code == 401
    assert (await client.get("/me/providers")).status_code == 401


@pytest.mark.parametrize("claims", [
    {"aud": "different-app"}, {"iss": "https://evil.example"}, {"exp": 1},
    {"nonce": "wrong"}, {"sub": ""}, {"iat": 9999999999}, {"azp": "different-app"},
    {"aud": ["qa-google-client", "another-client"]},
])
async def test_invalid_signed_claims_never_issue_session(client, signer, claims):
    response = await finish(client, signer, **claims)
    assert response.status_code == 401, response.text
    assert "access_token" not in response.text


async def test_missing_email_and_bad_signature_are_rejected(client, signer):
    assert (await finish(client, signer, email_verified=False)).status_code == 409
    assert (await finish(client, signer, email=None)).status_code == 409
    challenge = await begin(client)
    token = signer(challenge["nonce"])
    head, body, signature = token.split(".")
    signature = ("A" if signature[0] != "A" else "B") + signature[1:]
    result = await client.post("/auth/providers/complete", headers=HEADERS,
        json={"challenge_token": challenge["challenge_token"], "identity_token": ".".join((head, body, signature))})
    assert result.status_code == 401


async def test_disabled_device_expiry_and_attempt_budget(client, signer, monkeypatch, session_factory):
    monkeypatch.setattr(settings, "google_client_ids", "")
    assert (await client.get("/auth/providers/config")).json() == {"google": False, "apple": True}
    assert (await client.post("/auth/providers/begin", headers=HEADERS, json={"provider": "google"})).status_code == 503
    assert (await client.post("/auth/providers/begin", json={"provider": "apple"})).status_code == 400
    challenge = await begin(client, "apple")
    wire = {"challenge_token": challenge["challenge_token"], "identity_token": signer(challenge["nonce"], "apple")}
    assert (await client.post("/auth/providers/complete", json=wire)).status_code == 401
    async with session_factory() as db:
        record = await db.scalar(select(ProviderAttempt))
        record.expires_at = auth._now() - timedelta(seconds=1)
        await db.commit()
    assert (await client.post("/auth/providers/complete", headers=HEADERS, json=wire)).status_code == 401
    for _ in range(10):
        await begin(client, "apple")
    assert (await client.post("/auth/providers/begin", headers=HEADERS, json={"provider": "apple"})).status_code == 429


async def verified_account(client, session_factory):
    user, tokens, headers = await account(client, email="provider@example.com")
    async with session_factory() as db:
        record = await db.get(User, UUID(user["id"]))
        record.email_verified = True
        await db.commit()
    return user, tokens, headers


async def test_existing_account_requires_password_and_disconnect_revokes_sessions(client, signer, session_factory):
    user, old, headers = await verified_account(client, session_factory)
    proof = (await finish(client, signer)).json()
    assert proof["action"] == "link_required" and not proof["two_factor_required"]
    payload = {"ticket": proof["ticket"], "current_password": "wrong"}
    assert (await client.post("/auth/providers/link", headers=HEADERS, json=payload)).status_code == 400
    payload["current_password"] = PASSWORD
    linked = await client.post("/auth/providers/link", headers=HEADERS, json=payload)
    assert linked.status_code == 200, linked.text
    assert (await client.post("/auth/providers/link", headers=HEADERS, json=payload)).status_code == 401
    deleted = await client.post("/me/providers/google/disconnect", headers=headers, json={"current_password": PASSWORD})
    assert deleted.status_code == 204, deleted.text
    for token, device in [(old["refresh_token"], "install-a"), (linked.json()["refresh_token"], "provider-install")]:
        assert (await client.post("/auth/refresh", headers={"X-Device-Id": device}, json={"refresh_token": token})).status_code == 401
    assert (await finish(client, signer)).json()["action"] == "link_required"


async def test_link_and_repeat_login_preserve_two_factor_and_unlink_cancels_challenge(client, signer, session_factory, monkeypatch):
    from cryptography.fernet import Fernet
    from pydantic import SecretStr
    monkeypatch.setattr(settings, "mfa_encryption_key", SecretStr(Fernet.generate_key().decode()))
    _, _, headers = await verified_account(client, session_factory)
    factor = await enable(client, headers)
    proof = (await finish(client, signer)).json()
    assert proof["two_factor_required"]
    payload = {"ticket": proof["ticket"], "current_password": PASSWORD, "code": "000000"}
    assert (await client.post("/auth/providers/link", headers=HEADERS, json=payload)).status_code == 400
    payload["code"] = factor["recovery_codes"][0]
    assert (await client.post("/auth/providers/link", headers=HEADERS, json=payload)).status_code == 200
    challenge = (await finish(client, signer)).json()
    assert challenge["mfa_required"] and "access_token" not in challenge
    assert (await client.post("/me/providers/google/disconnect", headers=headers,
        json={"current_password": PASSWORD, "code": factor["recovery_codes"][1]})).status_code == 204
    assert (await client.post("/auth/two-factor/verify", headers=HEADERS,
        json={"challenge_token": challenge["challenge_token"], "code": factor["recovery_codes"][2]})).status_code == 401


async def test_link_ticket_expires_when_password_changes_and_guesses_are_durable(client, signer, session_factory):
    _, _, headers = await verified_account(client, session_factory)
    proof = (await finish(client, signer)).json()
    for index in range(5):
        response = await client.post("/auth/providers/link", headers=HEADERS,
            json={"ticket": proof["ticket"], "current_password": "wrong"})
        assert response.status_code == (429 if index == 4 else 400)
    assert (await client.post("/auth/providers/link", headers=HEADERS,
        json={"ticket": proof["ticket"], "current_password": PASSWORD})).status_code == 429
    assert (await client.post("/auth/password/change", headers=headers,
        json={"current_password": PASSWORD, "new_password": "NewPassword123!"})).status_code == 204
    assert (await client.post("/auth/providers/link", headers=HEADERS,
        json={"ticket": proof["ticket"], "current_password": "NewPassword123!"})).status_code == 401


async def test_linking_legacy_account_does_not_change_email_verification_or_role(client, signer, session_factory):
    user, _, _ = await account(client, email="provider@example.com")
    assert not user["email_verified"]
    proof = (await finish(client, signer)).json()
    assert proof["action"] == "link_required"
    result = await client.post("/auth/providers/link", headers=HEADERS,
        json={"ticket": proof["ticket"], "current_password": PASSWORD})
    assert result.status_code == 200, result.text
    current = (await client.get("/me",headers={"Authorization":f"Bearer {result.json()['access_token']}"})).json()
    assert current["id"] == user["id"] and not current["email_verified"] and current["role"] == "user"
