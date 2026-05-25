import hashlib
import hmac
import json

from fastapi import APIRouter, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..deps import DbSession
from ..schemas.payment import PaymentStatus, WebhookIn
from ..services.payment_service import handle_webhook_event

router = APIRouter(prefix="/v1/webhooks", tags=["Webhooks"])


def _verify_hmac_sha256(
    raw_body: bytes, signature: str | None, secret: str, *, provider: str
) -> None:
    """Audit findings C-8 + B-16.

    Fails closed when the configured secret is empty — a forgotten env var
    must never allow a payment forger to spoof events. Note: real Stripe
    uses a structured `t=...,v1=...` signature header with a timestamp;
    this simple HMAC-of-body matches what the codebase had and what the
    audit prescribed. Full Stripe-spec parsing is a follow-up (separate
    from the secret-handling fix).
    """
    if not secret:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            f"{provider} webhook secret not configured",
        )
    if not signature:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, f"missing {provider} signature"
        )
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, f"invalid {provider} signature"
        )


@router.post("/stripe")
async def stripe_webhook(
    request: Request,
    session: AsyncSession = DbSession,
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
):
    raw_body = await request.body()
    _verify_hmac_sha256(
        raw_body,
        stripe_signature,
        settings.stripe_webhook_secret,
        provider="stripe",
    )
    payload = json.loads(raw_body) if raw_body else {}
    event = WebhookIn(
        event_id=str(payload.get("id", "")),
        payment_reference=str(payload.get("data", {}).get("object", {}).get("id", "")),
        status=PaymentStatus(str(payload.get("data", {}).get("object", {}).get("status", "failed"))),
        raw=payload,
    )
    await handle_webhook_event(session, "stripe", event)
    return {"ok": True}


@router.post("/mpesa")
async def mpesa_webhook(
    request: Request,
    session: AsyncSession = DbSession,
    mpesa_signature: str | None = Header(default=None, alias="X-MPESA-Signature"),
):
    """Audit finding B-16. Previously accepted any payload with no signature
    check, allowing forged payment confirmations on the M-Pesa rail. We now
    require an HMAC-SHA256 over the raw body. Production M-Pesa (Daraja)
    integrations may need to adapt to their specific IPN signing scheme;
    this matches the audit's prescribed HMAC pattern and the Stripe path
    above so both rails fail closed identically.
    """
    raw_body = await request.body()
    _verify_hmac_sha256(
        raw_body,
        mpesa_signature,
        settings.mpesa_webhook_secret,
        provider="mpesa",
    )
    payload = json.loads(raw_body) if raw_body else {}
    event = WebhookIn(
        event_id=str(payload.get("event_id", "")),
        payment_reference=str(payload.get("payment_reference", "")),
        status=PaymentStatus(str(payload.get("status", "failed"))),
        raw=payload,
    )
    await handle_webhook_event(session, "mpesa", event)
    return {"ok": True}