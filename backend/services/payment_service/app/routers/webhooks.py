import hashlib
import hmac

from fastapi import APIRouter, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import DbSession
from ..schemas.payment import PaymentStatus, WebhookIn
from ..services.payment_service import handle_webhook_event

router = APIRouter(prefix="/v1/webhooks", tags=["Webhooks"])


def _verify_stripe_signature(raw_body: bytes, signature: str | None, secret: str) -> None:
    if not signature:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing stripe signature")
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid stripe signature")


@router.post("/stripe")
async def stripe_webhook(
    request: Request,
    session: AsyncSession = DbSession,
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
):
    raw_body = await request.body()
    _verify_stripe_signature(raw_body, stripe_signature, "change-me")
    payload = await request.json()
    event = WebhookIn(
        event_id=str(payload.get("id", "")),
        payment_reference=str(payload.get("data", {}).get("object", {}).get("id", "")),
        status=PaymentStatus(str(payload.get("data", {}).get("object", {}).get("status", "failed"))),
        raw=payload,
    )
    await handle_webhook_event(session, "stripe", event)
    return {"ok": True}


@router.post("/mpesa")
async def mpesa_webhook(payload: WebhookIn, session: AsyncSession = DbSession):
    await handle_webhook_event(session, "mpesa", payload)
    return {"ok": True}