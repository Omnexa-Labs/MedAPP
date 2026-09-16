"""Single-use provider proofs. Email alone never links or signs into an account."""
from datetime import timedelta

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from ..models import ProviderAttempt, ProviderIdentity, TwoFactorChallenge, User
from . import auth_service as auth, provider_tokens, two_factor_service as mfa
from .two_factor_service import FactorError


def configuration():
    return {provider: bool(provider_tokens.audiences(provider)) for provider in ("google", "apple")}


async def begin(db, provider, device_id):
    if not device_id:
        raise FactorError("Restart the app before using provider sign-in.", 400)
    if not configuration()[provider]:
        raise FactorError("This sign-in provider is not available yet. Use email and password.", 503)
    return await create_attempt(db, provider, device_id)


async def create_attempt(db, provider, device_id, *, stage="started"):
    """Allocate a bounded proof after the caller has checked its configuration."""
    now = auth._now()
    # Expired proofs contain contact data; prune them whenever this flow is used.
    await db.execute(delete(ProviderAttempt).where(ProviderAttempt.expires_at <= now))
    count = await db.scalar(select(func.count()).select_from(ProviderAttempt).where(
        ProviderAttempt.device_id == device_id, ProviderAttempt.created_at > now - timedelta(minutes=5)))
    if count >= 10:
        raise FactorError("Too many sign-in attempts. Try again in five minutes.", 429)
    raw = auth._new_opaque_token()
    nonce = auth._hash_token(auth._new_opaque_token())
    db.add(ProviderAttempt(token_hash=auth._hash_token(raw), provider=provider,
        device_id=device_id, nonce=nonce, stage=stage, expires_at=now + timedelta(minutes=5)))
    return {"challenge_token": raw, "nonce": nonce, "expires_in": 300}


async def attempt(db, raw, device_id, stage):
    record = await db.scalar(select(ProviderAttempt).where(
        ProviderAttempt.token_hash == auth._hash_token(raw)).with_for_update()
        .execution_options(populate_existing=True))
    if (not record or record.stage != stage or not device_id or record.device_id != device_id
            or auth._as_utc(record.expires_at) <= auth._now()):
        raise FactorError("Provider sign-in expired or was already used. Start again.", 401)
    if not configuration()[record.provider]:
        raise FactorError("This sign-in provider is not available yet. Use email and password.", 503)
    return record


async def finish(db, payload, *, device_id, ip=None, user_agent=None):
    record = await attempt(db, payload.challenge_token, device_id, "started")
    claims = await provider_tokens.verify(record.provider, payload.identity_token, record.nonce)
    record.stage = "done"
    identity = await db.scalar(select(ProviderIdentity).where(
        ProviderIdentity.provider == record.provider, ProviderIdentity.subject == claims["sub"]))
    if identity:
        user = await auth._lock_session_owner(db, identity.user_id)
        # Unlink and login serialize on the account, including a waiting request.
        identity = await db.scalar(select(ProviderIdentity).where(ProviderIdentity.id == identity.id)
                                  .execution_options(populate_existing=True))
        if not user or not user.is_active or not identity:
            raise FactorError("This account cannot use provider sign-in. Use email and password.", 401)
        factor = await mfa.state(db, user)
        if factor and factor.enabled:
            return await mfa.begin_login(db, user, factor, device_id)
        tokens = await auth.issue_tokens_for_user(db, user, device_id=device_id, ip=ip, user_agent=user_agent)
        await auth._audit(db, actor_id=user.id, target_user_id=user.id, action="login.succeeded",
                          ip=ip, user_agent=user_agent, meta={"provider": record.provider})
        return tokens
    try:
        if claims.get("email_verified") not in (True, "true"):
            raise ValueError("unverified email")
        email = str(TypeAdapter(EmailStr).validate_python(claims.get("email"))).lower()
    except (ValueError, ValidationError):
        raise FactorError("This provider did not share a verified email. Use email signup or sign-in.", 409)
    matches = list((await db.scalars(select(User).where(func.lower(User.email) == email).limit(2))).all())
    if len(matches) > 1 or (matches and not matches[0].is_active):
        raise FactorError("This account cannot use provider sign-in. Use email and password.", 409)
    raw = auth._new_opaque_token()
    record.token_hash = auth._hash_token(raw)
    record.subject = claims["sub"]
    record.email = email
    record.stage = "link" if matches else "signup"
    record.expires_at = auth._now() + timedelta(seconds=300 if matches else 1200)
    if matches:
        record.user_id = matches[0].id
        record.password_version = auth._hash_token(matches[0].password_hash)
        factor = await mfa.state(db, matches[0])
        return {"action": "link_required", "ticket": raw, "email": email,
                "provider": record.provider, "two_factor_required": bool(factor and factor.enabled), "expires_in": 300}
    # Names are editable hints. Apple may omit them after the first authorization.
    name = claims.get("name", "")
    return {"action": "signup_required", "ticket": raw, "email": email,
            "provider": record.provider, "display_name": name[:255] if isinstance(name, str) else "", "expires_in": 1200}


async def attach(db, user, record):
    try:
        async with db.begin_nested():
            db.add(ProviderIdentity(user_id=user.id, provider=record.provider, subject=record.subject))
            await db.flush()
    except IntegrityError as exc:
        raise FactorError("This provider is already connected. Sign in again or manage your connected accounts.", 409) from exc
    record.stage = "done"
    await auth._audit(db, actor_id=user.id, target_user_id=user.id,
                      action="provider.connected", meta={"provider": record.provider})


async def signup_proof(db, raw, email, email_verified, device_id):
    record = await attempt(db, raw, device_id, "signup")
    # Retain independent email OTP: Google is not authoritative for every third-party address.
    if not email_verified or record.email != email.lower():
        raise FactorError("Verify the same email before completing provider signup.", 400)
    return record


async def link(db, payload, *, device_id, ip=None, user_agent=None):
    record = await attempt(db, payload.ticket, device_id, "link")
    user = await auth._lock_session_owner(db, record.user_id)
    if (not user or not user.is_active
            or record.password_version != auth._hash_token(user.password_hash)):
        raise FactorError("Account changed. Start provider sign-in again.", 401)
    user, factor = await mfa.locked_state(db, user)
    await mfa.password_proof(db, user, factor, payload.current_password)
    if factor.enabled:
        await mfa.code_proof(db, user, factor, payload.code)
    await attach(db, user, record)
    await db.execute(delete(TwoFactorChallenge).where(TwoFactorChallenge.user_id == user.id))
    return await auth.issue_tokens_for_user(db, user, device_id=device_id, ip=ip,
        user_agent=user_agent, second_factor_verified=factor.enabled)


async def connections(db, user):
    rows = (await db.scalars(select(ProviderIdentity).where(ProviderIdentity.user_id == user.id)
                            .order_by(ProviderIdentity.provider))).all()
    return {"items": [{"provider": row.provider, "connected_at": row.created_at} for row in rows]}


async def remove(db, user, provider, payload):
    user, factor = await mfa.locked_state(db, user)
    await mfa.password_proof(db, user, factor, payload.current_password)
    if factor.enabled:
        await mfa.code_proof(db, user, factor, payload.code)
    await db.execute(delete(ProviderIdentity).where(ProviderIdentity.user_id == user.id, ProviderIdentity.provider == provider))
    await db.execute(delete(TwoFactorChallenge).where(TwoFactorChallenge.user_id == user.id))
    await auth._revoke_all_for_user(db, user.id, reason="provider_disconnected")
    await auth._audit(db, actor_id=user.id, target_user_id=user.id,
                     action="provider.disconnected", meta={"provider": provider})
