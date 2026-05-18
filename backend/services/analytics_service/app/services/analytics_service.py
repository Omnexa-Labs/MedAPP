from __future__ import annotations

import hashlib
from collections import Counter
from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import EventLog
from ..schemas.analytics import DoctorScorecardOut, EventIngest, FunnelMetricsOut, RetentionItemOut, RetentionMetricsOut


class AnalyticsError(ValueError):
    pass


def _hash_subject(subject_user_id: UUID | None) -> str | None:
    if subject_user_id is None:
        return None
    return hashlib.sha256(str(subject_user_id).encode("utf-8")).hexdigest()


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _principal_uuid(value: str) -> UUID:
    try:
        return UUID(value)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid UUID") from exc


def _require_admin(role: str) -> None:
    if role not in {"admin", "platform_admin"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin access required")


async def ingest_event(db: AsyncSession, payload: EventIngest) -> EventLog:
    existing = await db.scalar(select(EventLog).where(EventLog.event_id == payload.event_id))
    if existing is not None:
        return existing

    event = EventLog(
        event_id=payload.event_id,
        event_type=payload.event_type.strip(),
        source=payload.source.strip(),
        subject_hash=_hash_subject(payload.subject_user_id),
        occurred_at=payload.occurred_at,
        booking_id=payload.booking_id,
        doctor_id=payload.doctor_id,
        payment_id=payload.payment_id,
        amount_cents=payload.amount_cents,
        currency=payload.currency.upper() if payload.currency else None,
        status=_normalize_text(payload.status),
        metadata_json=payload.metadata,
        notes=_normalize_text(payload.notes),
    )
    db.add(event)
    await db.flush()
    await db.refresh(event)
    return event


async def build_funnel_metrics(db: AsyncSession, *, start_date: date, end_date: date) -> FunnelMetricsOut:
    start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=UTC)
    end_dt = datetime.combine(end_date + timedelta(days=1), datetime.min.time(), tzinfo=UTC)

    stmt = select(EventLog.event_type, func.count(EventLog.id)).where(EventLog.occurred_at >= start_dt, EventLog.occurred_at < end_dt).group_by(EventLog.event_type)
    rows = await db.execute(stmt)
    counts = Counter({event_type: count for event_type, count in rows.all()})

    bookings_created = counts.get("booking.created", 0)
    payments_succeeded = counts.get("payment.succeeded", 0)
    bookings_confirmed = counts.get("booking.confirmed", 0)

    booking_to_payment_rate = payments_succeeded / bookings_created if bookings_created else 0.0
    payment_to_confirmation_rate = bookings_confirmed / payments_succeeded if payments_succeeded else 0.0

    return FunnelMetricsOut(
        period_start=start_date,
        period_end=end_date,
        bookings_created=bookings_created,
        payments_succeeded=payments_succeeded,
        bookings_confirmed=bookings_confirmed,
        booking_to_payment_rate=booking_to_payment_rate,
        payment_to_confirmation_rate=payment_to_confirmation_rate,
    )


async def build_retention_metrics(db: AsyncSession, *, start_date: date, end_date: date) -> RetentionMetricsOut:
    start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=UTC)
    end_dt = datetime.combine(end_date + timedelta(days=1), datetime.min.time(), tzinfo=UTC)

    stmt = select(EventLog.subject_hash, EventLog.occurred_at).where(EventLog.subject_hash.is_not(None), EventLog.occurred_at >= start_dt, EventLog.occurred_at < end_dt)
    rows = (await db.execute(stmt)).all()

    by_day: dict[date, set[str]] = {}
    first_seen: dict[str, date] = {}
    for subject_hash, occurred_at in rows:
        day = occurred_at.date()
        by_day.setdefault(day, set()).add(subject_hash)
        first_seen.setdefault(subject_hash, day)

    items = []
    current = start_date
    while current <= end_date:
        active_users = len(by_day.get(current, set()))
        new_users = sum(1 for day in first_seen.values() if day == current)
        items.append(RetentionItemOut(day=current, active_users=active_users, new_users=new_users))
        current += timedelta(days=1)

    return RetentionMetricsOut(period_start=start_date, period_end=end_date, items=items)


async def build_doctor_scorecard(db: AsyncSession, doctor_id: UUID) -> DoctorScorecardOut:
    bookings_created = await db.scalar(select(func.count(EventLog.id)).where(EventLog.doctor_id == doctor_id, EventLog.event_type == "booking.created")) or 0
    bookings_confirmed = await db.scalar(select(func.count(EventLog.id)).where(EventLog.doctor_id == doctor_id, EventLog.event_type == "booking.confirmed")) or 0
    payments_succeeded = await db.scalar(select(func.count(EventLog.id)).where(EventLog.doctor_id == doctor_id, EventLog.event_type == "payment.succeeded")) or 0
    revenue_cents = await db.scalar(select(func.coalesce(func.sum(EventLog.amount_cents), 0)).where(EventLog.doctor_id == doctor_id, EventLog.event_type == "payment.succeeded")) or 0

    conversion_rate = bookings_confirmed / bookings_created if bookings_created else 0.0
    average_revenue_per_payment_cents = revenue_cents / payments_succeeded if payments_succeeded else 0.0

    return DoctorScorecardOut(
        doctor_id=doctor_id,
        bookings_created=bookings_created,
        bookings_confirmed=bookings_confirmed,
        payments_succeeded=payments_succeeded,
        revenue_cents=revenue_cents,
        conversion_rate=conversion_rate,
        average_revenue_per_payment_cents=average_revenue_per_payment_cents,
    )