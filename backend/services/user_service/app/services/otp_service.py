"""OTP issue + verify. 6-digit numeric, hashed at rest, single-use, with
per-recipient attempt cap and resend cooldown."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

import jwt as pyjwt
from sqlalchemy import or_

from ..config import settings
from ..models import OtpCode, User
from .auth_service import AuthError, issue_tokens_for_user
from .notifiers import EmailNotifier, SmsNotifier

# OTP purposes.
#
# `login`         — passwordless login for an EXISTING phone user.
#                   verify_otp_and_login mints a session token pair.
# `signup_verify` — proves a NEW signup's contact is reachable. No user
#                   record required. verify_signup_otp issues a short-
#                   lived JWT the signup endpoint accepts as proof.
SIGNUP_VERIFY_PURPOSE = "signup_verify"
LOGIN_PURPOSE = "login"

# Channels supported by start_otp.
CHANNEL_SMS = "sms"
CHANNEL_EMAIL = "email"

# Short-lived JWT minted on successful signup-verify and consumed by
# `/auth/signup`. 15 minutes is plenty for the user to finish Steps 2 + 3
# of the wizard; short enough that a stolen token isn't useful.
SIGNUP_VERIFY_TOKEN_TTL_MINUTES = 15
SIGNUP_VERIFY_TOKEN_TYPE = "signup_verify"


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
    sms: SmsNotifier | None = None,
    email: EmailNotifier | None = None,
) -> int:
    """Returns OTP TTL (seconds). Enforces resend cooldown.

    `channel` is `sms` or `email`; pass the matching notifier. The caller
    (router) decides which based on the user-picked channel.
    """
    if channel == CHANNEL_SMS and sms is None:
        raise AuthError("sms notifier required for sms channel")
    if channel == CHANNEL_EMAIL and email is None:
        raise AuthError("email notifier required for email channel")
    if channel not in (CHANNEL_SMS, CHANNEL_EMAIL):
        raise AuthError(f"unsupported channel: {channel}")

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
    if channel == CHANNEL_SMS:
        assert sms is not None
        await sms.send(phone=recipient, body=f"MedApp code: {code}")
    else:
        assert email is not None
        await email.send(
            email=recipient,
            subject="Your MedApp verification code",
            body=f"Your MedApp verification code is: {code}\n\nThis code expires in {settings.otp_ttl_seconds // 60} minutes.",
        )
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
    await verify_otp(db, recipient=phone, code=code, purpose=LOGIN_PURPOSE)
    user = await db.scalar(select(User).where(User.phone == phone))
    if not user or not user.is_active:
        raise AuthError("user not found")
    if not user.phone_verified:
        user.phone_verified = True
    tokens = await issue_tokens_for_user(db, user)
    return user, tokens


# ── Signup OTP (no existing user required) ──────────────────────────────────


async def start_signup_otp(
    db: AsyncSession,
    *,
    channel: str,
    recipient: str,
    sms: SmsNotifier | None = None,
    email: EmailNotifier | None = None,
) -> int:
    """Send an OTP to verify a NEW signup's contact.

    Refuses to send if a user with that contact already exists — saves
    the operator from leaking "this account exists" via OTP delivery and
    avoids confusing users who already have an account.
    """
    # Existing-contact guard. Email is normalised to lowercase to match
    # how the User model stores it (per the EmailStr schema).
    contact = recipient.lower() if channel == CHANNEL_EMAIL else recipient
    existing = await db.scalar(
        select(User).where(
            or_(User.email == contact, User.phone == contact)
        )
    )
    if existing:
        # Generic error — don't leak which of email/phone exists.
        raise AuthError("contact already in use")

    return await start_otp(
        db,
        recipient=contact,
        purpose=SIGNUP_VERIFY_PURPOSE,
        channel=channel,
        sms=sms,
        email=email,
    )


async def verify_signup_otp(
    db: AsyncSession,
    *,
    channel: str,
    recipient: str,
    code: str,
) -> str:
    """Verify a signup OTP and return a short-lived JWT proof token.

    The returned token's payload pins `channel` + `recipient` — the
    signup endpoint compares them to the SignupRequest body and refuses
    a token issued for a different contact.
    """
    contact = recipient.lower() if channel == CHANNEL_EMAIL else recipient
    await verify_otp(
        db, recipient=contact, code=code, purpose=SIGNUP_VERIFY_PURPOSE
    )
    return _issue_signup_verify_token(channel=channel, recipient=contact)


def _issue_signup_verify_token(*, channel: str, recipient: str) -> str:
    now = _now()
    payload = {
        "typ": SIGNUP_VERIFY_TOKEN_TYPE,
        "chan": channel,
        "rcp": recipient,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=SIGNUP_VERIFY_TOKEN_TTL_MINUTES)).timestamp()),
    }
    return pyjwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def verify_signup_verify_token(token: str) -> tuple[str, str]:
    """Decode a signup-verify token; returns `(channel, recipient)` or
    raises AuthError. Used by `/auth/signup` to confirm a payload's
    contact has been OTP-verified within the last 15 minutes."""
    try:
        claims = pyjwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except pyjwt.ExpiredSignatureError as exc:
        raise AuthError("verification token expired") from exc
    except pyjwt.PyJWTError as exc:
        raise AuthError("invalid verification token") from exc
    if claims.get("typ") != SIGNUP_VERIFY_TOKEN_TYPE:
        raise AuthError("wrong token type")
    channel = claims.get("chan")
    recipient = claims.get("rcp")
    if channel not in (CHANNEL_SMS, CHANNEL_EMAIL) or not recipient:
        raise AuthError("malformed verification token")
    return channel, recipient
