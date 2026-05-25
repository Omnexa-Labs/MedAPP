from uuid import UUID

from fastapi import APIRouter, Header
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import CurrentPrincipalDep, DbSession
from ..schemas.payment import PaymentCreate, PaymentOut, PaymentRefundCreate, PaymentRefundOut
from ..services.idempotency import require_idempotency_key
from ..services.payment_service import create_payment_intent, get_payment, refund_payment

router = APIRouter(prefix="/v1/payments", tags=["Payments"])


@router.post("/intent", response_model=PaymentOut)
async def create_intent(payload: PaymentCreate, session: AsyncSession = DbSession, principal=CurrentPrincipalDep):
    payment = await create_payment_intent(session, principal, payload)
    return payment


@router.get("/{payment_id}", response_model=PaymentOut)
async def read_payment(payment_id: UUID, session: AsyncSession = DbSession, principal=CurrentPrincipalDep):
    return await get_payment(session, principal, payment_id)


@router.post("/{payment_id}/refund", response_model=PaymentRefundOut)
async def refund(
    payment_id: UUID,
    payload: PaymentRefundCreate,
    session: AsyncSession = DbSession,
    principal=CurrentPrincipalDep,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    """Refund a payment. **Requires** ``Idempotency-Key`` header — see
    audit finding B-17. Replays with the same key + body return the
    cached response; replays with a different body return 409."""
    key = require_idempotency_key(idempotency_key)
    return await refund_payment(session, principal, payment_id, payload, key)