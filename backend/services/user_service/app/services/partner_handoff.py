"""Short-lived mobile proofs partitioned by portal and pharmacy deployment."""

import re
import secrets
from datetime import timedelta
from urllib.parse import urlencode, urlsplit
from uuid import UUID

from sqlalchemy import delete, func, select, update

from ..config import settings
from ..models import PartnerHandoff, RefreshToken
from . import auth_service as auth
from .two_factor_service import FactorError

EXPIRED = "This link expired or was already used. Open a new link from MedApp."


def configuration(portal="partner", deployment_key=None):
    if portal == "pharmacy":
        from .pharmacy_handoff import configuration as pharmacy_configuration

        return pharmacy_configuration(deployment_key)
    if portal not in {"partner", "hospital"}:
        raise FactorError("This portal is unavailable.", 503)
    secret = (
        settings.hms_handoff_secret if portal == "hospital" else settings.partner_handoff_secret
    )
    origin = settings.hms_web_origin if portal == "hospital" else settings.partner_web_origin
    if (
        portal == "hospital"
        and secret
        and settings.partner_handoff_secret
        and secrets.compare_digest(
            secret.get_secret_value(), settings.partner_handoff_secret.get_secret_value()
        )
    ):
        raise FactorError("Hospital handoff needs its own server credential.", 503)
    try:
        parsed = urlsplit(origin)
    except ValueError as exc:
        raise FactorError("Opening this portal from MedApp is not configured yet.", 503) from exc
    local = parsed.hostname in {"localhost", "127.0.0.1", "10.0.2.2", "::1"}
    if (
        not secret
        or len(secret.get_secret_value()) < 32
        or not parsed.hostname
        or (parsed.scheme != "https" and not (local and parsed.scheme == "http"))
        or parsed.username
        or parsed.password
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise FactorError("Opening this portal from MedApp is not configured yet.", 503)
    return origin.rstrip("/"), secret.get_secret_value()


def server_proof(provided, portal="partner", deployment_key=None):
    _, expected = configuration(portal, deployment_key)
    if not provided or not secrets.compare_digest(provided, expected):
        raise FactorError("The partner server could not be verified.", 403)


def allowed_return(uri, portal="partner"):
    returns = (
        settings.pms_return_uris
        if portal == "pharmacy"
        else settings.hms_return_uris
        if portal == "hospital"
        else settings.partner_return_uris
    )
    route = (
        "pharmacy-workspaces"
        if portal == "pharmacy"
        else "hospital-workspaces"
        if portal == "hospital"
        else "onboarding-status"
    )
    allowed = {value.strip() for value in returns.split(",") if value.strip()}
    if uri not in allowed:
        return False
    try:
        parsed = urlsplit(uri)
    except ValueError:
        return False
    local = parsed.hostname in {"localhost", "127.0.0.1", "10.0.2.2", "::1"}
    return (
        uri in allowed
        and not parsed.query
        and not parsed.fragment
        and not parsed.username
        and not parsed.password
        and (
            uri == f"medapp://{route}"
            or (
                parsed.path == f"/{route}"
                and parsed.hostname
                and (parsed.scheme == "https" or (local and parsed.scheme == "http"))
            )
        )
    )


async def active_source(db, user_id, session_id):
    return await db.scalar(
        select(RefreshToken)
        .where(
            RefreshToken.user_id == user_id,
            RefreshToken.session_id == session_id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > auth._now(),
        )
        .limit(1)
        .execution_options(populate_existing=True)
    )


async def start(db, user, payload, authorization, device_id, *, portal="partner"):
    target = None
    if portal == "pharmacy":
        from .pharmacy_handoff import destination

        target = await destination(authorization, payload.pharmacy_id)
    origin, _ = configuration(portal, target["deployment_key"] if target else None)
    if not allowed_return(payload.return_uri, portal):
        raise FactorError("This MedApp return address is not configured.", 400)
    try:
        session_id = UUID(auth.decode_access_token(authorization.split(" ", 1)[1])["sid"])
    except (ValueError, KeyError, TypeError, IndexError) as exc:
        raise FactorError("Sign in again before opening onboarding.", 401) from exc
    user = await auth._lock_session_owner(db, user.id)
    if not user:
        raise FactorError("Sign in again before opening onboarding.", 401)
    source = await active_source(db, user.id, session_id)
    if not user.is_active or not source or not device_id or source.device_id != device_id:
        raise FactorError("Sign in again before opening onboarding.", 401)
    if portal == "pharmacy" and not user.email_verified:
        raise FactorError("Verify your MedApp email before opening pharmacy access.", 403)
    now = auth._now()
    await db.execute(
        delete(PartnerHandoff).where(PartnerHandoff.expires_at < now - timedelta(days=1))
    )
    count = await db.scalar(
        select(func.count())
        .select_from(PartnerHandoff)
        .where(
            PartnerHandoff.user_id == user.id,
            PartnerHandoff.created_at > now - timedelta(minutes=5),
        )
    )
    if count >= 10:
        raise FactorError("Too many onboarding links. Try again in five minutes.", 429)
    code = auth._new_opaque_token()
    record = PartnerHandoff(
        portal=portal,
        token_hash=auth._hash_token(code),
        user_id=user.id,
        source_session_id=session_id,
        password_version=auth._hash_token(user.password_hash),
        application_id=getattr(payload, "application_id", None),
        pharmacy_id=target["pharmacy_id"] if target else None,
        deployment_key=target["deployment_key"] if target else None,
        return_uri=payload.return_uri,
        return_state=payload.return_state,
        expires_at=now + timedelta(seconds=120),
    )
    db.add(record)
    await db.flush()
    return {
        "handoff_id": str(record.id),
        "url": origin + "/handoff#" + urlencode({"code": code}),
        "expires_in": 120,
    }


async def proof(db, code, portal="partner", deployment_key=None):
    record = await db.scalar(
        select(PartnerHandoff).where(
            PartnerHandoff.token_hash == auth._hash_token(code),
            PartnerHandoff.portal == portal,
            *([PartnerHandoff.deployment_key == deployment_key] if portal == "pharmacy" else []),
        )
    )
    if not record:
        raise FactorError(EXPIRED, 410)
    # Same account lock order as refresh, logout, password change and MFA enrollment.
    user = await auth._lock_session_owner(db, record.user_id)
    await db.refresh(record)
    if (
        not user
        or not user.is_active
        or (portal == "pharmacy" and not user.email_verified)
        or record.consumed_at
        or auth._as_utc(record.expires_at) <= auth._now()
        or record.password_version != auth._hash_token(user.password_hash)
        or not allowed_return(record.return_uri, portal)
        or not await active_source(db, record.user_id, record.source_session_id)
    ):
        raise FactorError(EXPIRED, 410)
    return record, user


async def inspect(db, code, *, portal="partner", deployment_key=None):
    record, user = await proof(db, code, portal, deployment_key)
    return {
        "user_id": str(user.id),
        "name": f"{user.first_name} {user.last_name}".strip(),
        "email": user.email,
        "expires_at": record.expires_at.isoformat(),
        **(
            {"pharmacy_id": str(record.pharmacy_id), "deployment_key": record.deployment_key}
            if portal == "pharmacy"
            else {}
        ),
    }


async def redeem(
    db, code, *, ip=None, user_agent=None, portal="partner", device_id=None, deployment_key=None
):
    if portal in {"hospital", "pharmacy"} and (
        not device_id or not re.fullmatch(r"[a-f0-9]{64}", device_id)
    ):
        raise FactorError("The hospital browser session could not be identified.", 400)
    record, user = await proof(db, code, portal, deployment_key)
    # Conditional consumption also prevents sequential replay without row-lock support.
    changed = await db.execute(
        update(PartnerHandoff)
        .where(
            PartnerHandoff.id == record.id,
            PartnerHandoff.consumed_at.is_(None),
            PartnerHandoff.expires_at > auth._now(),
        )
        .values(consumed_at=auth._now())
        .execution_options(synchronize_session=False)
    )
    if changed.rowcount != 1:
        raise FactorError(EXPIRED, 410)
    # An active session already passed the required sign-in factors. Enrollment and
    # account recovery revoke that source; this never asserts a factor from a callback.
    tokens = await auth.issue_tokens_for_user(
        db,
        user,
        second_factor_verified=True,
        ip=ip,
        user_agent=user_agent or "MedApp web",
        device_id=device_id,
    )
    await auth._audit(
        db,
        actor_id=user.id,
        target_user_id=user.id,
        action=f"{portal}.handoff",
        ip=ip,
        user_agent=user_agent,
        meta={"source_session_id": str(record.source_session_id)},
    )
    return {
        "tokens": tokens.model_dump(),
        "user_id": str(user.id),
        "destination": "/dashboard"
        if portal == "pharmacy"
        else "/workspaces"
        if portal == "hospital"
        else f"/applications/{record.application_id}/details"
        if record.application_id
        else "/new",
        "return_url": record.return_uri + "?" + urlencode({"handoff_state": record.return_state}),
        **(
            {"pharmacy_id": str(record.pharmacy_id), "deployment_key": record.deployment_key}
            if portal == "pharmacy"
            else {}
        ),
    }


async def cancel(db, user, handoff_id, *, portal="partner"):
    await auth._lock_session_owner(db, user.id)
    await db.execute(
        update(PartnerHandoff)
        .where(
            PartnerHandoff.id == handoff_id,
            PartnerHandoff.portal == portal,
            PartnerHandoff.user_id == user.id,
            PartnerHandoff.consumed_at.is_(None),
        )
        .values(consumed_at=auth._now())
    )
