from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from ..models import Booking
from ..schemas.booking import BookingCancel, BookingCreate, BookingList, BookingOut, BookingStatus, BookingSummaryOut


class BookingError(ValueError):
    pass


def _principal_uuid(principal: Principal) -> UUID:
    try:
        return UUID(principal.subject)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid principal subject") from exc


def _ensure_timezone_aware(value: datetime, field_name: str) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise BookingError(f"{field_name} must be timezone-aware")


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _can_manage_booking(principal: Principal, booking: Booking | None = None) -> None:
    if principal.role == "admin":
        return
    if booking is not None and booking.user_id == _principal_uuid(principal):
        return
    raise HTTPException(status.HTTP_403_FORBIDDEN, "you can only manage your own booking")


async def create_booking(db: AsyncSession, principal: Principal, payload: BookingCreate) -> Booking:
    user_id = _principal_uuid(principal)
    if payload.starts_at >= payload.ends_at:
        raise BookingError("starts_at must be before ends_at")
    _ensure_timezone_aware(payload.starts_at, "starts_at")
    _ensure_timezone_aware(payload.ends_at, "ends_at")
    if payload.starts_at <= datetime.now(tz=timezone.utc):
        raise BookingError("booking must start in the future")

    conflict_stmt = select(Booking).where(
        Booking.doctor_id == payload.doctor_id,
        Booking.status == BookingStatus.BOOKED.value,
        Booking.starts_at < payload.ends_at,
        Booking.ends_at > payload.starts_at,
    )
    if await db.scalar(conflict_stmt):
        raise BookingError("doctor is already booked for that time window")

    booking = Booking(
        user_id=user_id,
        doctor_id=payload.doctor_id,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        status=BookingStatus.BOOKED.value,
        reason=_normalize_text(payload.reason),
        notes=_normalize_text(payload.notes),
    )
    db.add(booking)
    await db.flush()
    await db.refresh(booking)
    return booking


async def list_bookings(
    db: AsyncSession,
    principal: Principal,
    *,
    all_bookings: bool = False,
    doctor_id: UUID | None = None,
    status_filter: BookingStatus | None = None,
) -> BookingList:
    if all_bookings and principal.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin access required")

    stmt = select(Booking)
    if not all_bookings:
        stmt = stmt.where(Booking.user_id == _principal_uuid(principal))
    if doctor_id is not None:
        stmt = stmt.where(Booking.doctor_id == doctor_id)
    if status_filter is not None:
        stmt = stmt.where(Booking.status == status_filter.value)
    stmt = stmt.order_by(Booking.starts_at.asc())
    result = await db.scalars(stmt)
    items = [BookingOut.model_validate(booking) for booking in result.all()]
    return BookingList(items=items)


async def get_booking_summary(
    db: AsyncSession,
    principal: Principal,
    *,
    all_bookings: bool = False,
    doctor_id: UUID | None = None,
) -> BookingSummaryOut:
    bookings = await list_bookings(db, principal, all_bookings=all_bookings, doctor_id=doctor_id)
    now = datetime.now(tz=timezone.utc)
    booked = [booking for booking in bookings.items if booking.status == BookingStatus.BOOKED]
    cancelled = [booking for booking in bookings.items if booking.status == BookingStatus.CANCELLED]
    upcoming = [booking for booking in booked if _as_utc(booking.starts_at) >= now][:3]
    return BookingSummaryOut(
        total_count=len(bookings.items),
        booked_count=len(booked),
        cancelled_count=len(cancelled),
        upcoming_bookings=upcoming,
    )


async def get_booking(db: AsyncSession, principal: Principal, booking_id: UUID) -> Booking:
    booking = await db.get(Booking, booking_id)
    if not booking:
        raise BookingError("booking not found")
    _can_manage_booking(principal, booking)
    return booking


async def cancel_booking(
    db: AsyncSession,
    principal: Principal,
    booking_id: UUID,
    payload: BookingCancel,
) -> Booking:
    booking = await get_booking(db, principal, booking_id)
    if booking.status == BookingStatus.CANCELLED.value:
        raise BookingError("booking is already cancelled")
    booking.status = BookingStatus.CANCELLED.value
    booking.cancelled_at = datetime.now(tz=timezone.utc)
    booking.cancellation_reason = _normalize_text(payload.cancellation_reason)
    await db.flush()
    await db.refresh(booking)
    return booking
