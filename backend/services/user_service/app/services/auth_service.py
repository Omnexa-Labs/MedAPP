"""Auth business logic: signup, login, refresh rotation, logout, password
flows. No HTTP concerns here — routers call into these functions and map
exceptions to status codes.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth.jwt import decode_token, issue_access_token

from ..config import settings
from ..models import AuditLog, PasswordResetToken, RefreshToken, User
from ..schemas import LoginRequest, SignupRequest, TokenPair

_hasher = PasswordHasher()


class AuthError(Exception):
    """Domain error — routers translate these to 4xx responses."""


# ---------- helpers ----------


def _hash_token(raw: str) -> str:
    # Refresh and reset tokens are stored only as hashes so a DB leak does not expose them.
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _new_opaque_token(nbytes: int = 32) -> str:
    # Use an opaque random token for refresh/password-reset flows instead of JWTs.
    return secrets.token_urlsafe(nbytes)


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _as_utc(dt: datetime | None) -> datetime | None:
    """Some DB backends (notably SQLite via aiosqlite) drop timezone info on
    round-trip. Treat naive datetimes from the DB as UTC."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


async def _audit(
    db: AsyncSession,
    *,
    actor_id: UUID | None,
    action: str,
    target_user_id: UUID | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
    meta: dict | None = None,
) -> None:
    # Audit rows are appended in the same transaction as the user action.
    db.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            target_user_id=target_user_id,
            ip_address=ip,
            user_agent=user_agent,
            meta=meta or {},
        )
    )


# ---------- signup ----------


async def signup(
    db: AsyncSession,
    payload: SignupRequest,
    *,
    ip: str | None = None,
    user_agent: str | None = None,
) -> User:
    # Enforce uniqueness at the service layer so the router only handles HTTP mapping.
    existing = await db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise AuthError("Email already exists")
    if payload.phone:
        clash = await db.scalar(select(User).where(User.phone == payload.phone))
        if clash:
            raise AuthError("Phone already exists")

    # Decide verification flags from the optional signup-verify token.
    # The token pins (channel, recipient); we trust it only if the
    # recipient matches the signup payload's matching contact. A token
    # bound to a different contact is treated as absent — account is
    # created unverified rather than failing (which would leak "you
    # used the wrong token here" semantics mid-signup).
    email_verified = False
    phone_verified = False
    verified_channel: str | None = None
    if payload.verification_token:
        # Lazy import to avoid a circular dep (otp_service imports
        # issue_tokens_for_user from this module).
        from .otp_service import verify_signup_verify_token

        try:
            channel, recipient = verify_signup_verify_token(payload.verification_token)
        except AuthError:
            channel, recipient = None, None
        if channel == "email" and recipient == payload.email.lower():
            email_verified = True
            verified_channel = "email"
        elif channel == "sms" and payload.phone and recipient == payload.phone:
            phone_verified = True
            verified_channel = "sms"

    # Generic app users do not require KYC. Provider/admin roles do.
    kyc_status = "not_required" if payload.role == "user" else "pending"
    user = User(
        email=payload.email,
        phone=payload.phone,
        password_hash=_hasher.hash(payload.password),
        first_name=payload.first_name,
        last_name=payload.last_name,
        role=payload.role,
        kyc_status=kyc_status,
        email_verified=email_verified,
        phone_verified=phone_verified,
    )
    db.add(user)
    await db.flush()
    audit_meta: dict = {"role": payload.role}
    if verified_channel:
        audit_meta["verified_channel"] = verified_channel
    await _audit(
        db,
        actor_id=user.id,
        action="user.registered",
        target_user_id=user.id,
        ip=ip,
        user_agent=user_agent,
        meta=audit_meta,
    )
    return user


# ---------- login / token issuance ----------


async def login(
    db: AsyncSession,
    payload: LoginRequest,
    *,
    ip: str | None = None,
    user_agent: str | None = None,
    device_id: str | None = None,
) -> tuple[User, TokenPair]:
    # Use the same path for credential verification and audit logging so the
    # observable security trail stays consistent.
    user = await db.scalar(select(User).where(User.email == payload.email))
    if not user or not user.is_active:
        _hasher.hash("dummy")  # keep timing similar on a missing-user path
        raise AuthError("invalid credentials")
    try:
        _hasher.verify(user.password_hash, payload.password)
    except VerifyMismatchError as exc:
        await _audit(
            db,
            actor_id=None,
            action="login.failed",
            target_user_id=user.id,
            ip=ip,
            user_agent=user_agent,
        )
        raise AuthError("invalid credentials") from exc

    tokens = await issue_tokens_for_user(
        db, user, ip=ip, user_agent=user_agent, device_id=device_id
    )
    await _audit(
        db,
        actor_id=user.id,
        action="login.succeeded",
        target_user_id=user.id,
        ip=ip,
        user_agent=user_agent,
        meta={"device_id": device_id} if device_id else None,
    )
    return user, tokens


async def issue_tokens_for_user(
    db: AsyncSession,
    user: User,
    *,
    ip: str | None = None,
    user_agent: str | None = None,
    device_id: str | None = None,
) -> TokenPair:
    """Issue an access + refresh pair for a user (used by login and by
    OTP-verified phone signup/login).

    `device_id` is the mobile client's per-install identifier
    (`X-Device-Id` header). Persisting it lets the refresh path enforce
    that the same install must present the same id — see `refresh()`.
    """
    # Access tokens are short-lived and signed; refresh tokens are opaque and
    # stored hashed so the server can revoke them without keeping secrets in DB.
    access = issue_access_token(
        subject=str(user.id),
        role=user.role,
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        ttl_minutes=settings.jwt_access_ttl_minutes,
    )
    raw_refresh = _new_opaque_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=_hash_token(raw_refresh),
            expires_at=_now() + timedelta(days=settings.jwt_refresh_ttl_days),
            user_agent=user_agent,
            ip_address=ip,
            device_id=device_id,
        )
    )
    await db.flush()
    return TokenPair(
        access_token=access,
        refresh_token=raw_refresh,
        expires_in=settings.jwt_access_ttl_minutes * 60,
    )


# ---------- refresh rotation ----------


async def refresh(
    db: AsyncSession,
    raw_token: str,
    *,
    ip: str | None = None,
    user_agent: str | None = None,
    device_id: str | None = None,
    biometric: bool = False,
) -> tuple[TokenPair, dict]:
    """Rotate a refresh token. Returns `(tokens, audit_meta)`.

    `audit_meta` carries side-channel signals the router uses to emit
    domain events AFTER the request transaction commits (so a rabbit
    outage can't roll back the auth):

        biometric_login: bool — set when the client sent `biometric=true`
                                AND the rotation succeeded. The router
                                publishes `user.biometric_login`.
        user_id: str          — subject for the event.

    `device_id` enforcement: if the stored row has a non-null device_id,
    the request MUST present the same value. If the row's device_id is
    NULL (issued before this column existed), the check is skipped — a
    one-time grace window during the mobile rollout. The next rotation
    will record the new device_id and start enforcing.
    """
    # Refresh rotation is strict: only the latest valid token can produce a new pair.
    token_hash = _hash_token(raw_token)
    record = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if not record:
        raise AuthError("invalid refresh token")
    if record.revoked_at is not None:
        # Reused after revocation — likely token theft. Revoke the whole chain
        # and commit the revocation BEFORE raising, since the request transaction
        # is rolled back on exception.
        await _revoke_all_for_user(db, record.user_id, reason="reuse_detected")
        await _audit(
            db,
            actor_id=record.user_id,
            action="refresh.reuse_detected",
            target_user_id=record.user_id,
            ip=ip,
            user_agent=user_agent,
        )
        await db.commit()
        raise AuthError("refresh token reused")
    if (_as_utc(record.expires_at) or _now()) <= _now():
        raise AuthError("refresh token expired")

    # Device-binding check. NULL stored device_id = legacy row, grandfather
    # it. A stored non-null value MUST match the incoming header — a
    # mismatch is the exact signature of a stolen-token replay from a
    # different install. Revoke the chain and log it.
    if record.device_id is not None and record.device_id != device_id:
        await _revoke_all_for_user(db, record.user_id, reason="device_mismatch")
        await _audit(
            db,
            actor_id=record.user_id,
            action="refresh.device_mismatch",
            target_user_id=record.user_id,
            ip=ip,
            user_agent=user_agent,
            meta={
                "expected_device_id": record.device_id,
                "presented_device_id": device_id,
            },
        )
        await db.commit()
        raise AuthError("refresh token bound to a different device")

    user = await db.get(User, record.user_id)
    if not user or not user.is_active:
        raise AuthError("user inactive")

    new_raw = _new_opaque_token()
    new_hash = _hash_token(new_raw)
    record.revoked_at = _now()
    record.replaced_by = new_hash
    # New row carries the device_id from the current request — for legacy
    # rows (record.device_id is None) the next rotation onwards starts
    # enforcing.
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=new_hash,
            expires_at=_now() + timedelta(days=settings.jwt_refresh_ttl_days),
            user_agent=user_agent,
            ip_address=ip,
            device_id=device_id if device_id is not None else record.device_id,
        )
    )

    access = issue_access_token(
        subject=str(user.id),
        role=user.role,
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        ttl_minutes=settings.jwt_access_ttl_minutes,
    )

    # In-band audit row. The biometric domain event is published AFTER
    # commit by the router; we drop a row here so the audit table tells
    # the story even if rabbit is down.
    if biometric:
        await _audit(
            db,
            actor_id=user.id,
            action="user.biometric_login",
            target_user_id=user.id,
            ip=ip,
            user_agent=user_agent,
            meta={"device_id": device_id} if device_id else None,
        )

    await db.flush()
    tokens = TokenPair(
        access_token=access,
        refresh_token=new_raw,
        expires_in=settings.jwt_access_ttl_minutes * 60,
    )
    audit_meta = {
        "user_id": str(user.id),
        "biometric_login": biometric,
        "device_id": device_id,
    }
    return tokens, audit_meta


async def _revoke_all_for_user(db: AsyncSession, user_id: UUID, *, reason: str) -> None:
    # When reuse is detected, revoke the whole active chain for that user.
    stmt = select(RefreshToken).where(
        and_(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
    )
    rows = (await db.scalars(stmt)).all()
    now = _now()
    for r in rows:
        r.revoked_at = now
        r.replaced_by = f"revoked:{reason}"


async def logout(db: AsyncSession, raw_token: str, *, actor_id: UUID | None = None) -> None:
    # Logout is idempotent because client retries should not turn into failures.
    token_hash = _hash_token(raw_token)
    record = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if not record or record.revoked_at is not None:
        return  # idempotent
    record.revoked_at = _now()
    record.replaced_by = "revoked:logout"
    await _audit(
        db,
        actor_id=actor_id or record.user_id,
        action="logout",
        target_user_id=record.user_id,
    )


# ---------- password reset ----------


async def request_password_reset(db: AsyncSession, email: str) -> tuple[User, str] | None:
    """Returns (user, raw_token) or None. Router still responds 200 either way
    so an attacker can't enumerate registered emails."""
    # We intentionally avoid signaling whether the email exists.
    user = await db.scalar(select(User).where(User.email == email))
    if not user or not user.is_active:
        return None
    raw = _new_opaque_token()
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=_hash_token(raw),
            expires_at=_now() + timedelta(minutes=settings.password_reset_ttl_minutes),
        )
    )
    await db.flush()
    return user, raw


async def reset_password(db: AsyncSession, raw_token: str, new_password: str) -> User:
    # Password reset tokens are single-use and time-limited.
    token_hash = _hash_token(raw_token)
    record = await db.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
    )
    if (
        not record
        or record.consumed_at is not None
        or (_as_utc(record.expires_at) or _now()) <= _now()
    ):
        raise AuthError("invalid or expired reset token")
    user = await db.get(User, record.user_id)
    if not user:
        raise AuthError("invalid reset token")
    user.password_hash = _hasher.hash(new_password)
    record.consumed_at = _now()
    await _revoke_all_for_user(db, user.id, reason="password_reset")
    await _audit(
        db, actor_id=user.id, action="password.reset_completed", target_user_id=user.id
    )
    return user


async def change_password(
    db: AsyncSession, user: User, current_password: str, new_password: str
) -> None:
    # Changing a password invalidates outstanding refresh tokens so old sessions die.
    try:
        _hasher.verify(user.password_hash, current_password)
    except VerifyMismatchError as exc:
        raise AuthError("current password incorrect") from exc
    user.password_hash = _hasher.hash(new_password)
    await _revoke_all_for_user(db, user.id, reason="password_change")
    await _audit(db, actor_id=user.id, action="password.changed", target_user_id=user.id)


# ---------- token decode (used by deps.py) ----------


def decode_access_token(token: str) -> dict:
    # Centralize access-token validation so deps.py and routers share one rule set.
    claims = decode_token(token, secret=settings.jwt_secret, algorithm=settings.jwt_algorithm)
    if claims.get("typ") != "access":
        raise AuthError("not an access token")
    return claims


__all__ = [
    "AuthError",
    "signup",
    "login",
    "refresh",
    "logout",
    "issue_tokens_for_user",
    "request_password_reset",
    "reset_password",
    "change_password",
    "decode_access_token",
]
