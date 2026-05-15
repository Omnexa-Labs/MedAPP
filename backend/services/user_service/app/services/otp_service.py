"""OTP issue + verify. 6-digit numeric, hashed at rest, single-use, with
per-recipient attempt cap and resend cooldown."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models import OtpCode, User
from .auth_service import AuthError, issue_tokens_for_user
from .notifiers import SmsNotifier


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def _gen_code() -> str:
    # secrets.randbelow gives 0..999_999 uniformly; format with leading zeros.
    return f"{secrets.randbelow(1_000_000):06d}"


async def start_otp(
    db: AsyncSession,
    *,
    recipient: str,
    purpose: str,
    channel: str,
    sms: SmsNotifier,
) -> int:
    """Returns OTP TTL (seconds). Enforces resend cooldown."""
    # Cooldown: latest non-consumed code for this (recipient, purpose).
    latest = await db.scalar(
        select(OtpCode)
        .where(OtpCode.recipient == recipient, OtpCode.purpose == purpose)
        .order_by(desc(OtpCode.created_at))
        .limit(1)
    )
    if latest and latest.consumed_at is None:
        created_at = _as_utc(latest.created_at) or _now()
        elapsed = (_now() - created_at).total_seconds()
        if elapsed < settings.otp_resend_cooldown_seconds:
            raise AuthError(
                f"please wait {int(settings.otp_resend_cooldown_seconds - elapsed)}s"
                f" before requesting another code"
            )

    code = _gen_code()
    db.add(
        OtpCode(
            recipient=recipient,
            channel=channel,
            purpose=purpose,
            code_hash=_hash_code(code),
            expires_at=_now() + timedelta(seconds=settings.otp_ttl_seconds),
        )
    )
    await db.flush()
    await sms.send(phone=recipient, body=f"MedApp code: {code}")
    return settings.otp_ttl_seconds


async def verify_otp(
    db: AsyncSession,
    *,
    recipient: str,
    code: str,
    purpose: str,
) -> OtpCode:
    record = await db.scalar(
        select(OtpCode)
        .where(
            OtpCode.recipient == recipient,
            OtpCode.purpose == purpose,
            OtpCode.consumed_at.is_(None),
        )
        .order_by(desc(OtpCode.created_at))
        .limit(1)
    )
    if not record:
        raise AuthError("no active code")
    if (_as_utc(record.expires_at) or _now()) <= _now():
        raise AuthError("code expired")
    if record.attempts >= settings.otp_max_attempts:
        raise AuthError("too many attempts")
    record.attempts += 1
    if record.code_hash != _hash_code(code):
        raise AuthError("invalid code")
    record.consumed_at = _now()
    return record


async def verify_otp_and_login(
    db: AsyncSession,
    *,
    phone: str,
    code: str,
):
    """End-to-end: verify the code, then mint tokens. The user must already
    exist — phone-only signup happens via /auth/signup with phone field."""
    await verify_otp(db, recipient=phone, code=code, purpose="login")
    user = await db.scalar(select(User).where(User.phone == phone))
    if not user or not user.is_active:
        raise AuthError("user not found")
    if not user.phone_verified:
        user.phone_verified = True
    tokens = await issue_tokens_for_user(db, user)
    return user, tokens
