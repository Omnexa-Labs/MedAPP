"""Workspace SSO for existing, explicitly authorized administrators.

An email match cannot create, connect, or elevate an account. The dedicated web
audience is deliberately separate from ordinary mobile provider sign-in.
"""

import re
from datetime import timedelta

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import select

from ..config import settings
from ..models import ProviderAttempt, ProviderIdentity
from . import auth_service as auth
from . import provider_auth, provider_tokens
from . import two_factor_service as mfa
from .two_factor_service import FactorError

DENIED = "This Google Workspace account is not authorized for MedApp Admin."


def configuration():
    client = settings.admin_google_client_id.strip()
    domains = sorted(
        {
            value.strip().lower()
            for value in settings.admin_workspace_domains.split(",")
            if value.strip()
        }
    )
    valid_domain = re.compile(r"(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}")
    enabled = bool(
        client
        and not any(character.isspace() for character in client)
        and "," not in client
        and domains
        and all(len(domain) <= 253 and valid_domain.fullmatch(domain) for domain in domains)
    )
    return {
        "enabled": enabled,
        "client_id": client if enabled else None,
        "hosted_domains": domains if enabled else [],
    }


def configured():
    result = configuration()
    if not result["enabled"]:
        raise FactorError("Admin Google Workspace sign-in is not configured yet.", 503)
    return result


async def begin(db, device_id):
    config = configured()
    if not device_id:
        raise FactorError("Restart admin sign-in to continue.", 400)
    proof = await provider_auth.create_attempt(db, "google", device_id, stage="admin_started")
    return {**proof, "client_id": config["client_id"], "hosted_domains": config["hosted_domains"]}


async def attempt(db, raw, device_id, stage):
    configured()
    record = await db.scalar(
        select(ProviderAttempt)
        .where(ProviderAttempt.token_hash == auth._hash_token(raw))
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if (
        not record
        or record.provider != "google"
        or record.stage != stage
        or not device_id
        or record.device_id != device_id
        or auth._as_utc(record.expires_at) <= auth._now()
    ):
        raise FactorError("Admin sign-in expired or was already used. Start again.", 401)
    return record


def workspace_email(claims):
    try:
        email = str(TypeAdapter(EmailStr).validate_python(claims.get("email"))).lower()
    except (ValueError, ValidationError) as exc:
        raise FactorError(DENIED, 403) from exc
    domain = claims.get("hd")
    if (
        (claims.get("email_verified") is not True and claims.get("email_verified") != "true")
        or not isinstance(domain, str)
        or domain.lower() not in configured()["hosted_domains"]
        or email.rsplit("@", 1)[-1] != domain.lower()
    ):
        raise FactorError(DENIED, 403)
    return email


async def authorized_user(db, subject, email):
    identity = await db.scalar(
        select(ProviderIdentity).where(
            ProviderIdentity.provider == "google", ProviderIdentity.subject == subject
        )
    )
    if not identity:
        raise FactorError(DENIED, 403)
    user = await auth._lock_session_owner(db, identity.user_id)
    # Serialize against provider unlink and account changes before issuing access.
    identity = await db.scalar(
        select(ProviderIdentity)
        .where(ProviderIdentity.id == identity.id)
        .execution_options(populate_existing=True)
    )
    if (
        not identity
        or not user
        or not user.is_active
        or user.role not in ("admin", "platform_admin")
        or user.email.lower() != email
        or email.rsplit("@", 1)[-1] not in configured()["hosted_domains"]
    ):
        raise FactorError(DENIED, 403)
    return user


async def audit(db, user, ip, user_agent):
    await auth._audit(
        db,
        actor_id=user.id,
        target_user_id=user.id,
        action="admin_sso.succeeded",
        ip=ip,
        user_agent=user_agent,
        meta={"provider": "google"},
    )


async def finish(db, payload, *, device_id, ip=None, user_agent=None):
    record = await attempt(db, payload.challenge_token, device_id, "admin_started")
    claims = await provider_tokens.verify(
        "google",
        payload.identity_token,
        record.nonce,
        allowed_audiences=[configured()["client_id"]],
    )
    # A verified Google proof is spent even if the account is not authorized.
    record.stage = "done"
    email = workspace_email(claims)
    user = await authorized_user(db, claims["sub"], email)
    factor = await mfa.state(db, user)
    if factor and factor.enabled:
        challenge = await mfa.begin_login(db, user, factor, device_id)
        record.stage = "admin_mfa"
        record.token_hash = auth._hash_token(challenge.challenge_token)
        record.subject = claims["sub"]
        record.email = email
        record.user_id = user.id
        record.expires_at = auth._now() + timedelta(seconds=challenge.expires_in)
        return challenge
    tokens = await auth.issue_tokens_for_user(
        db, user, device_id=device_id, ip=ip, user_agent=user_agent
    )
    await audit(db, user, ip, user_agent)
    return tokens


async def verify_factor(db, payload, *, device_id, ip=None, user_agent=None):
    record = await attempt(db, payload.challenge_token, device_id, "admin_mfa")
    user = await authorized_user(db, record.subject, record.email)
    tokens = await mfa.complete_login(
        db, payload.challenge_token, payload.code, device_id=device_id, ip=ip, user_agent=user_agent
    )
    record.stage = "done"
    await audit(db, user, ip, user_agent)
    return tokens
