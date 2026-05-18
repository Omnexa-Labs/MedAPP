from uuid import UUID

from fastapi import APIRouter
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import CurrentPrincipalDep, DbSession
from ..schemas.payment import PaymentCreate, PaymentOut, PaymentRefundCreate, PaymentRefundOut
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
async def refund(payment_id: UUID, payload: PaymentRefundCreate, session: AsyncSession = DbSession, principal=CurrentPrincipalDep):
    return await refund_payment(session, principal, payment_id, payload)