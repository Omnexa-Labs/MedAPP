from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.payment import Payment, PaymentEvent, PaymentRefund, PaymentStatus
from ..schemas.payment import PaymentCreate, PaymentMethod, PaymentRefundCreate, PaymentStatus as PaymentStatusSchema, WebhookIn


class PaymentError(RuntimeError):
    pass


def _principal_uuid(principal) -> UUID:
    try:
        return UUID(str(principal.subject))
    except ValueError as exc:  # noqa: BLE001
        raise PaymentError("invalid principal subject") from exc


def _provider_prefix(method: str) -> str:
    return {
        PaymentMethod.STRIPE: "pi",
        PaymentMethod.MPESA: "mp",
        PaymentMethod.MOMO: "mo",
    }.get(method, "py")


async def create_payment_intent(session: AsyncSession, principal, payload: PaymentCreate) -> Payment:
    user_id = _principal_uuid(principal)
    provider_reference = f"{_provider_prefix(payload.method)}_{uuid4().hex}"

    if payload.idempotency_key:
        existing = await session.scalar(select(Payment).where(Payment.idempotency_key == payload.idempotency_key))
        if existing is not None:
            if existing.user_id != user_id:
                raise HTTPException(status.HTTP_409_CONFLICT, "idempotency key already used")
            return existing

    payment = Payment(
        user_id=user_id,
        booking_id=payload.booking_id,
        amount_cents=payload.amount_cents,
        currency=payload.currency.upper(),
        method=payload.method.value,
        status=PaymentStatus.PENDING,
        provider_reference=provider_reference,
        idempotency_key=payload.idempotency_key,
        description=payload.description,
        metadata_json=payload.metadata,
    )
    session.add(payment)
    await session.flush()
    return payment


async def get_payment(session: AsyncSession, principal, payment_id: UUID) -> Payment:
    payment = await session.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "payment not found")
    principal_id = _principal_uuid(principal)
    if payment.user_id != principal_id and principal.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
    return payment


async def refund_payment(session: AsyncSession, principal, payment_id: UUID, payload: PaymentRefundCreate) -> PaymentRefund:
    payment = await get_payment(session, principal, payment_id)
    if payment.status != PaymentStatus.SUCCEEDED:
        raise HTTPException(status.HTTP_409_CONFLICT, "only succeeded payments can be refunded")

    amount_cents = payload.amount_cents or payment.amount_cents
    if amount_cents > payment.amount_cents:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "refund exceeds payment amount")

    refund = PaymentRefund(
        payment_id=payment.id,
        amount_cents=amount_cents,
        reason=payload.reason,
        status="requested",
        provider_reference=f"rf_{uuid4().hex}",
        processed_at=datetime.now(UTC),
    )
    payment.status = PaymentStatus.REFUNDED
    session.add(refund)
    await session.flush()
    return refund


async def handle_webhook_event(session: AsyncSession, provider: str, payload: WebhookIn) -> PaymentEvent:
    existing = await session.scalar(select(PaymentEvent).where(PaymentEvent.event_id == payload.event_id))
    if existing is not None:
        return existing

    payment = None
    if payload.payment_id is not None:
        payment = await session.get(Payment, payload.payment_id)
    if payment is None:
        payment = await session.scalar(select(Payment).where(Payment.provider_reference == payload.payment_reference))

    event = PaymentEvent(
        provider=provider,
        event_id=payload.event_id,
        payment_id=payment.id if payment is not None else None,
        raw_body=payload.raw or {
            "event_id": payload.event_id,
            "payment_reference": payload.payment_reference,
            "status": payload.status.value,
        },
        parsed_status=payload.status.value,
        error=None,
    )
    session.add(event)

    if payment is not None:
        payment.status = payload.status.value
        if payload.status == PaymentStatusSchema.SUCCEEDED:
            payment.confirmed_at = datetime.now(UTC)
        elif payload.status == PaymentStatusSchema.FAILED:
            payment.failed_at = datetime.now(UTC)
    await session.flush()
    return event