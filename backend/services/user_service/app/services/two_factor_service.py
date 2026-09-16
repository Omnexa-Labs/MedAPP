"""TOTP enrollment, replay prevention and password-verified login challenges.

All account mutations share the User row lock with refresh/revocation. Failure
counters must commit even when a proof is rejected; routers return these errors.
"""
import json
import secrets
from datetime import timedelta
from uuid import uuid4

import pyotp
from argon2.exceptions import VerificationError
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import delete, select

from ..config import settings
from ..models import TwoFactor, TwoFactorChallenge
from ..schemas.two_factor import LoginChallenge, SetupResponse, TwoFactorStatus
from . import auth_service as auth

SETUP_TTL = 600
CHALLENGE_TTL = 300
MAX_FAILURES = 5
LOCK_SECONDS = 900


class FactorError(auth.AuthError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def cipher():
    try:
        value = settings.mfa_encryption_key
        return Fernet(value.get_secret_value().encode() if value else b"")
    except (ValueError, TypeError) as exc:
        raise FactorError("Authenticator setup is temporarily unavailable.", 503) from exc


async def state(db, user):
    return await db.scalar(select(TwoFactor).where(TwoFactor.user_id == user.id)
                           .execution_options(populate_existing=True))


async def locked_state(db, user):
    user = await auth._lock_session_owner(db, user.id)
    if not user or not user.is_active:
        raise FactorError("Account unavailable.", 401)
    factor = await state(db, user)
    if factor is None:
        factor = TwoFactor(user_id=user.id, enabled=False, generation=str(uuid4()),
                           recovery_hashes=[], failures=0)
        db.add(factor)
        await db.flush()
    return user, factor


def check_lock(factor):
    if factor.locked_until and auth._as_utc(factor.locked_until) > auth._now():
        raise FactorError("Too many attempts. Try again in 15 minutes.", 429)
    if factor.locked_until:
        factor.locked_until = None
        factor.failures = 0


async def fail(db, user, factor):
    factor.failures += 1
    if factor.failures >= MAX_FAILURES:
        factor.locked_until = auth._now() + timedelta(seconds=LOCK_SECONDS)
    await auth._audit(db, actor_id=user.id, action="two_factor.proof_failed", target_user_id=user.id)
    raise FactorError("Too many attempts. Try again in 15 minutes." if factor.locked_until
                      else "Password or code is incorrect, expired, or already used.",
                      429 if factor.locked_until else 400)


async def password_proof(db, user, factor, password):
    check_lock(factor)
    try:
        auth._hasher.verify(user.password_hash, password)
    except VerificationError:
        await fail(db, user, factor)


def recovery_hash(user, code):
    normalized = code.replace("-", "").replace(" ", "").upper()
    return auth._hash_token(f"medapp.recovery.v1:{user.id}:{normalized}")


def recovery_codes(user, factor):
    # 80 random bits each; only account-bound hashes persist.
    raw = [secrets.token_hex(10).upper() for _ in range(10)]
    codes = ["-".join(value[i:i+5] for i in range(0, 20, 5)) for value in raw]
    factor.recovery_hashes = [recovery_hash(user, value) for value in codes]
    return codes


def decrypt_secret(user, factor):
    try:
        payload = json.loads(cipher().decrypt(factor.secret_encrypted.encode()))
        if payload["user_id"] != str(user.id) or payload["generation"] != factor.generation:
            raise ValueError("secret binding mismatch")
        return payload["secret"]
    except (InvalidToken, ValueError, KeyError, AttributeError) as exc:
        raise FactorError("Authenticator is unavailable. Use a recovery code or try again later.", 503) from exc


async def code_proof(db, user, factor, code, *, allow_recovery=True):
    check_lock(factor)
    digest = recovery_hash(user, code)
    if allow_recovery and any(secrets.compare_digest(digest, item) for item in factor.recovery_hashes):
        factor.recovery_hashes = [item for item in factor.recovery_hashes if item != digest]
        factor.failures = 0
        return
    if len(code) == 6 and code.isascii() and code.isdigit():
        totp = pyotp.TOTP(decrypt_secret(user, factor))
        current = int(auth._now().timestamp()) // 30
        for step in (current, current - 1, current + 1):
            if (factor.last_step is None or step > factor.last_step) and secrets.compare_digest(totp.at(step * 30), code):
                factor.last_step = step
                factor.failures = 0
                return
    await fail(db, user, factor)


async def status(db, user):
    factor = await state(db, user)
    try:
        cipher()
        available = True
    except FactorError:
        available = False
    return TwoFactorStatus(enabled=bool(factor and factor.enabled), available=available,
        recovery_codes_remaining=len(factor.recovery_hashes) if factor and factor.enabled else 0,
        sign_out_delay_seconds=settings.jwt_access_ttl_minutes * 60)


async def start_setup(db, user, password):
    user, factor = await locked_state(db, user)
    await password_proof(db, user, factor, password)
    if factor.enabled:
        raise FactorError("Two-factor authentication is already on.", 409)
    encryption = cipher()
    secret = pyotp.random_base32()
    factor.generation = str(uuid4())
    factor.secret_encrypted = encryption.encrypt(json.dumps({"user_id": str(user.id),
        "generation": factor.generation, "secret": secret}).encode()).decode()
    factor.setup_expires_at = auth._now() + timedelta(seconds=SETUP_TTL)
    factor.setup_password_version = auth._hash_token(user.password_hash)
    factor.last_step = None
    # Do not reset failures here: restarting setup cannot reset the guessing budget.
    codes = recovery_codes(user, factor)
    return SetupResponse(setup_id=factor.generation, secret=secret,
        provisioning_uri=pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name="MedApp"),
        recovery_codes=codes, expires_in=SETUP_TTL)


async def confirm_setup(db, user, setup_id, code):
    user, factor = await locked_state(db, user)
    if (factor.enabled or factor.generation != str(setup_id) or not factor.setup_expires_at
            or factor.setup_password_version != auth._hash_token(user.password_hash)
            or auth._as_utc(factor.setup_expires_at) <= auth._now()):
        raise FactorError("Setup expired or changed. Check status and start again.", 409)
    await code_proof(db, user, factor, code, allow_recovery=False)
    factor.enabled = True
    factor.setup_expires_at = None
    factor.setup_password_version = None
    await auth._revoke_all_for_user(db, user.id, reason="two_factor_enabled")
    await auth._audit(db, actor_id=user.id, action="two_factor.enabled", target_user_id=user.id)


async def manage(db, user, password, code, *, disable=False):
    user, factor = await locked_state(db, user)
    if not factor.enabled:
        raise FactorError("Two-factor authentication is not on.", 409)
    await password_proof(db, user, factor, password)
    await code_proof(db, user, factor, code)
    if disable:
        factor.enabled = False
        factor.secret_encrypted = None
        factor.recovery_hashes = []
        factor.generation = str(uuid4())
        factor.last_step = None
        action = "disabled"
        result = None
    else:
        result = recovery_codes(user, factor)
        action = "recovery_regenerated"
    # Invalidate pending password challenges even on recovery-code replacement.
    await db.execute(delete(TwoFactorChallenge).where(TwoFactorChallenge.user_id == user.id))
    await auth._revoke_all_for_user(db, user.id, reason=f"two_factor_{action}")
    await auth._audit(db, actor_id=user.id, action=f"two_factor.{action}", target_user_id=user.id)
    return result


async def begin_login(db, user, factor, device_id):
    check_lock(factor)
    # One pending challenge per install. Expired challenges are pruned per account.
    await db.execute(delete(TwoFactorChallenge).where(TwoFactorChallenge.user_id == user.id,
        (TwoFactorChallenge.device_id == device_id) | (TwoFactorChallenge.expires_at <= auth._now())))
    raw = auth._new_opaque_token()
    db.add(TwoFactorChallenge(user_id=user.id, token_hash=auth._hash_token(raw),
        generation=factor.generation, password_version=auth._hash_token(user.password_hash),
        device_id=device_id, expires_at=auth._now() + timedelta(seconds=CHALLENGE_TTL)))
    return LoginChallenge(challenge_token=raw, expires_in=CHALLENGE_TTL)


async def complete_login(db, raw, code, *, device_id=None, ip=None, user_agent=None):
    record = await db.scalar(select(TwoFactorChallenge).where(TwoFactorChallenge.token_hash == auth._hash_token(raw)))
    if not record:
        raise FactorError("Sign-in expired. Start again with your password.", 401)
    user = await auth._lock_session_owner(db, record.user_id)
    # Refresh after the user lock; another request may have consumed/deleted it.
    record = await db.scalar(select(TwoFactorChallenge).where(TwoFactorChallenge.id == record.id)
                             .execution_options(populate_existing=True))
    factor = await state(db, user) if user else None
    if (not user or not user.is_active or not record or not factor or not factor.enabled
            or record.consumed_at or auth._as_utc(record.expires_at) <= auth._now()
            or record.generation != factor.generation or record.device_id != device_id
            or not secrets.compare_digest(record.password_version, auth._hash_token(user.password_hash))):
        raise FactorError("Sign-in expired or changed. Start again with your password.", 401)
    await code_proof(db, user, factor, code)
    record.consumed_at = auth._now()
    tokens = await auth.issue_tokens_for_user(db, user, device_id=device_id,
        ip=ip, user_agent=user_agent, second_factor_verified=True)
    await auth._audit(db, actor_id=user.id, action="login.succeeded", target_user_id=user.id,
                     ip=ip, user_agent=user_agent, meta={"two_factor": True})
    return tokens
