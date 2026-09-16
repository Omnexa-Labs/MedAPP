from datetime import timedelta
from uuid import UUID

import pyotp
import pytest
from cryptography.fernet import Fernet
from pydantic import SecretStr
from sqlalchemy import select

from app.config import settings
from app.models import AuditLog, RefreshToken, TwoFactor, TwoFactorChallenge, User
from app.services import auth_service as auth
from app.services import two_factor_service as mfa

pytestmark = pytest.mark.asyncio
PASSWORD = "Password123!"


@pytest.fixture(autouse=True)
def encryption_key(monkeypatch):
    monkeypatch.setattr(settings, "mfa_encryption_key", SecretStr(Fernet.generate_key().decode()))


async def account(client, email="factor@example.com"):
    result = await client.post("/auth/signup", json={"email": email, "password": PASSWORD,
        "first_name": "Ama", "last_name": "Mensah", "phone": "+233240000001" if email.startswith("factor") else None})
    assert result.status_code == 201, result.text
    tokens = (await client.post("/auth/login", json={"email": email, "password": PASSWORD}, headers={"X-Device-Id": "install-a"})).json()
    headers = {"Authorization": f"Bearer {tokens['access_token']}", "X-Device-Id": "install-a"}
    return result.json(), tokens, headers


async def setup(client, headers):
    result = await client.post("/me/two-factor/setup", headers=headers, json={"current_password": PASSWORD})
    assert result.status_code == 200, result.text
    assert result.headers["cache-control"] == "no-store"
    return result.json()


async def enable(client, headers):
    draft = await setup(client, headers)
    result = await client.post("/me/two-factor/confirm", headers=headers,
        json={"setup_id": draft["setup_id"], "code": pyotp.TOTP(draft["secret"]).now()})
    assert result.status_code == 204, result.text
    return draft


async def challenge(client, email="factor@example.com", device="install-a"):
    result = await client.post("/auth/login", json={"email": email, "password": PASSWORD}, headers={"X-Device-Id": device})
    assert result.status_code == 200, result.text
    assert set(result.json()) == {"mfa_required", "challenge_token", "expires_in"}
    return result.json()["challenge_token"]


async def verify(client, token, code, device="install-a"):
    return await client.post("/auth/two-factor/verify", headers={"X-Device-Id": device},
                             json={"challenge_token": token, "code": code})


async def test_enrollment_is_explicit_encrypted_private_and_revokes_sessions(client, db):
    user, tokens, headers = await account(client)
    assert (await client.get("/me/two-factor")).status_code == 401
    assert (await client.get("/me/two-factor", headers=headers)).json()["enabled"] is False
    draft = await setup(client, headers)
    assert (await client.get("/me/two-factor", headers=headers)).json()["enabled"] is False
    record = await db.scalar(select(TwoFactor))
    assert draft["secret"] not in record.secret_encrypted
    assert draft["recovery_codes"][0] not in str(record.recovery_hashes)
    assert pyotp.parse_uri(draft["provisioning_uri"]).secret == draft["secret"]
    assert len(set(draft["recovery_codes"])) == 10
    wrong = await client.post("/me/two-factor/confirm", headers=headers,
        json={"setup_id": draft["setup_id"], "code": "------"})
    assert wrong.status_code == 422
    good = await client.post("/me/two-factor/confirm", headers=headers,
        json={"setup_id": draft["setup_id"], "code": pyotp.TOTP(draft["secret"]).now()})
    assert good.status_code == 204
    assert (await client.post("/auth/refresh", headers=headers, json={"refresh_token": tokens["refresh_token"]})).status_code == 401
    status = (await client.get("/me/two-factor", headers=headers)).json()
    assert status == {"enabled": True, "available": True, "recovery_codes_remaining": 10, "sign_out_delay_seconds": 900}
    assert "secret" not in (await client.get("/me", headers=headers)).text
    assert draft["secret"] not in str((await db.scalars(select(AuditLog))).all())


async def test_challenge_is_not_access_and_recovery_login_is_single_use(client, db):
    _, _, headers = await account(client)
    draft = await enable(client, headers)
    raw = await challenge(client)
    record = await db.scalar(select(TwoFactorChallenge))
    assert record.token_hash != raw
    assert (await client.get("/me", headers={"Authorization": f"Bearer {raw}"})).status_code == 401
    assert (await verify(client, raw, draft["recovery_codes"][0], "other-install")).status_code == 401
    response = await verify(client, raw, draft["recovery_codes"][0].lower().replace("-", " "))
    assert response.status_code == 200, response.text
    assert "access_token" in response.json()
    assert (await verify(client, raw, draft["recovery_codes"][1])).status_code == 401
    assert (await verify(client, await challenge(client), draft["recovery_codes"][0])).status_code == 400
    status = (await client.get("/me/two-factor", headers=headers)).json()
    assert status["recovery_codes_remaining"] == 9


async def test_totp_replay_across_challenges_and_setup_is_rejected(client, monkeypatch):
    _, _, headers = await account(client)
    draft = await enable(client, headers)
    assert (await verify(client, await challenge(client), pyotp.TOTP(draft["secret"]).now())).status_code == 400
    now = auth._now() + timedelta(seconds=60)
    monkeypatch.setattr(auth, "_now", lambda: now)
    code = pyotp.TOTP(draft["secret"]).at(now)
    assert (await verify(client, await challenge(client), code)).status_code == 200
    assert (await verify(client, await challenge(client), code)).status_code == 400


async def test_failed_attempts_persist_across_new_challenges_and_lock_account(client, db, monkeypatch):
    _, _, headers = await account(client)
    draft = await enable(client, headers)
    for i in range(5):
        result = await verify(client, await challenge(client), "not-a-valid-code")
        assert result.status_code == (429 if i == 4 else 400)
    factor = await db.scalar(select(TwoFactor))
    assert factor.failures == 5
    assert (await client.post("/auth/login", json={"email": "factor@example.com", "password": PASSWORD})).status_code == 429
    now = auth._now() + timedelta(minutes=16)
    monkeypatch.setattr(auth, "_now", lambda: now)
    assert (await verify(client, await challenge(client), draft["recovery_codes"][0])).status_code == 200


async def test_setup_attempt_budget_survives_restart_and_bad_password(client, db):
    _, _, headers = await account(client)
    for _ in range(4):
        draft = await setup(client, headers)
        code = "000000" if pyotp.TOTP(draft["secret"]).now() != "000000" else "111111"
        assert (await client.post("/me/two-factor/confirm", headers=headers,
            json={"setup_id": draft["setup_id"], "code": code})).status_code == 400
    assert (await client.post("/me/two-factor/setup", headers=headers, json={"current_password": "wrong"})).status_code == 429
    assert (await db.scalar(select(TwoFactor))).failures == 5


async def test_expired_or_replaced_setup_and_foreign_setup_cannot_enable(client, db):
    _, _, headers = await account(client)
    first = await setup(client, headers)
    second = await setup(client, headers)
    body = {"setup_id": first["setup_id"], "code": pyotp.TOTP(first["secret"]).now()}
    assert (await client.post("/me/two-factor/confirm", headers=headers, json=body)).status_code == 409
    _, _, other = await account(client, "other@example.com")
    body = {"setup_id": second["setup_id"], "code": pyotp.TOTP(second["secret"]).now()}
    assert (await client.post("/me/two-factor/confirm", headers=other, json=body)).status_code == 409
    factor = await db.scalar(select(TwoFactor).where(TwoFactor.generation == second["setup_id"]))
    factor.setup_expires_at = auth._now() - timedelta(seconds=1)
    await db.commit()
    assert (await client.post("/me/two-factor/confirm", headers=headers, json=body)).status_code == 409


async def test_password_reset_invalidates_challenge_without_removing_factor(client, db):
    _, _, headers = await account(client)
    draft = await enable(client, headers)
    raw = await challenge(client)
    _, reset = await auth.request_password_reset(db, "factor@example.com")
    await db.commit()
    await auth.reset_password(db, reset, "NewPassword123!")
    await db.commit()
    assert (await verify(client, raw, draft["recovery_codes"][0])).status_code == 401
    result = await client.post("/auth/login", json={"email": "factor@example.com", "password": "NewPassword123!"})
    assert result.json()["mfa_required"] is True


async def test_password_reset_invalidates_unfinished_setup(client, db):
    _, _, headers = await account(client)
    draft = await setup(client, headers)
    _, reset = await auth.request_password_reset(db, "factor@example.com")
    await db.commit()
    await auth.reset_password(db, reset, "NewPassword123!")
    await db.commit()
    result = await client.post("/me/two-factor/confirm", headers=headers,
        json={"setup_id": draft["setup_id"], "code": pyotp.TOTP(draft["secret"]).now()})
    assert result.status_code == 409
    assert (await client.get("/me/two-factor", headers=headers)).json()["enabled"] is False


async def test_expired_challenge_inactive_account_and_replaced_challenge(client, db):
    user, _, headers = await account(client)
    draft = await enable(client, headers)
    first = await challenge(client)
    second = await challenge(client)
    assert (await verify(client, first, draft["recovery_codes"][0])).status_code == 401
    record = await db.scalar(select(TwoFactorChallenge))
    record.expires_at = auth._now() - timedelta(seconds=1)
    await db.commit()
    assert (await verify(client, second, draft["recovery_codes"][0])).status_code == 401
    third = await challenge(client)
    person = await db.get(User, UUID(user["id"]))
    person.is_active = False
    await db.commit()
    assert (await verify(client, third, draft["recovery_codes"][0])).status_code == 401


async def test_disable_requires_both_proofs_and_removes_secret(client, db):
    _, _, headers = await account(client)
    draft = await enable(client, headers)
    raw = await challenge(client)
    body = {"current_password": "wrong", "code": draft["recovery_codes"][0]}
    assert (await client.post("/me/two-factor/disable", headers=headers, json=body)).status_code == 400
    body["current_password"] = PASSWORD
    assert (await client.post("/me/two-factor/disable", headers=headers, json=body)).status_code == 204
    factor = await db.scalar(select(TwoFactor))
    assert not factor.enabled and factor.secret_encrypted is None and factor.recovery_hashes == []
    assert (await verify(client, raw, draft["recovery_codes"][1])).status_code == 401
    assert "access_token" in (await client.post("/auth/login", json={"email": "factor@example.com", "password": PASSWORD})).json()


async def test_recovery_regeneration_invalidates_old_codes_challenges_and_sessions(client):
    _, _, headers = await account(client)
    draft = await enable(client, headers)
    signed_in = (await verify(client, await challenge(client), draft["recovery_codes"][0])).json()
    raw = await challenge(client)
    result = await client.post("/me/two-factor/recovery-codes", headers=headers,
        json={"current_password": PASSWORD, "code": draft["recovery_codes"][1]})
    assert result.status_code == 200 and result.headers["cache-control"] == "no-store"
    codes = result.json()["recovery_codes"]
    assert len(codes) == 10 and not set(codes).intersection(draft["recovery_codes"])
    assert (await verify(client, raw, codes[0])).status_code == 401
    assert (await verify(client, await challenge(client), draft["recovery_codes"][2])).status_code == 400
    assert (await verify(client, await challenge(client), codes[0])).status_code == 200
    assert (await client.post("/auth/refresh", headers=headers, json={"refresh_token": signed_in["refresh_token"]})).status_code == 401


async def test_missing_encryption_key_disables_setup_but_recovery_remains_usable(client, monkeypatch):
    _, _, headers = await account(client)
    draft = await enable(client, headers)
    monkeypatch.setattr(settings, "mfa_encryption_key", None)
    assert (await client.get("/me/two-factor", headers=headers)).json()["available"] is False
    assert (await verify(client, await challenge(client), pyotp.TOTP(draft["secret"]).now())).status_code == 503
    assert (await verify(client, await challenge(client), draft["recovery_codes"][0])).status_code == 200
    _, _, other = await account(client, "other@example.com")
    assert (await client.post("/me/two-factor/setup", headers=other, json={"current_password": PASSWORD})).status_code == 503


async def test_alternate_token_issuance_cannot_bypass_factor(client, db, notifier):
    user, _, headers = await account(client)
    await enable(client, headers)
    person = await db.get(User, UUID(user["id"]))
    with pytest.raises(auth.AuthError, match="authenticator"):
        await auth.issue_tokens_for_user(db, person)
    await db.rollback()
    assert (await client.post("/auth/otp/start", json={"phone": user["phone"]})).status_code == 200
    from app.models import OtpCode
    from app.services.otp_service import _hash_code
    otp = await db.scalar(select(OtpCode))
    otp.code_hash = _hash_code("123456")
    await db.commit()
    result = await client.post("/auth/otp/verify", json={"phone": user["phone"], "code": "123456"})
    assert result.status_code == 400 and "authenticator" in result.text
    assert not (await db.scalars(select(RefreshToken).where(RefreshToken.revoked_at.is_(None)))).all()
