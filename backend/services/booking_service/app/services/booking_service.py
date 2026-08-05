from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from ..models import Booking
from ..schemas.booking import (
    BookingCancel,
    BookingCreate,
    BookingList,
    BookingMode,
    BookingOut,
    BookingScheduleList,
    BookingScheduleOut,
    BookingScheduleSummaryOut,
    BookingStatus,
    BookingSummaryOut,
)
from .doctor_directory import resolve_doctor_user_id
from .telemedicine import provision_room

log = logging.getLogger(__name__)

# Roles allowed to ask for the practitioner view of the schedule. Admins are
# NOT here: an admin's `subject` is their own user id, so the practitioner
# query would match nothing for them anyway, and support access already has a
# door in `?all_bookings=true`. Two roles with one narrow meaning each beats
# one role with two.
PRACTITIONER_ROLES = frozenset({"doctor"})


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
    """Write access: cancelling a booking. Patient or admin only.

    Deliberately NOT widened to the treating clinician. Cancelling is the
    patient's commitment to break; a clinician-initiated cancellation is a
    different workflow (with its own notification and, ideally, a reason the
    patient can see) and does not exist yet. Silently letting the doctor use
    the patient's cancel endpoint would ship that workflow without designing
    it.
    """
    if principal.role == "admin":
        return
    if booking is not None and booking.user_id == _principal_uuid(principal):
        return
    raise HTTPException(status.HTTP_403_FORBIDDEN, "you can only manage your own booking")


def _can_read_booking(principal: Principal, booking: Booking) -> None:
    """Read access to one booking: patient, admin, or the treating clinician.

    The clinician arm is what makes the minimisation in `BookingScheduleOut`
    workable — the schedule list withholds `reason`/`notes`, so the detail read
    has to be open to the doctor for the one patient they are about to see, or
    the clinical detail would be unreachable and clients would end up demanding
    it back in the list.

    The clinician arm authorises on `booking.doctor_user_id`, a value this
    service stored itself, compared to the token subject. `booking.doctor_id`
    is never used for this — different id space, and it is client-influenced at
    creation time. NULL `doctor_user_id` matches nobody: `None == UUID(...)` is
    False in Python, so an unresolved row denies here too.
    """
    if principal.role == "admin":
        return
    subject = _principal_uuid(principal)
    if booking.user_id == subject:
        return
    if principal.role in PRACTITIONER_ROLES and booking.doctor_user_id == subject:
        return
    raise HTTPException(status.HTTP_403_FORBIDDEN, "you cannot read this booking")


async def create_booking(
    db: AsyncSession,
    principal: Principal,
    payload: BookingCreate,
    *,
    authorization: str | None = None,
) -> Booking:
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

    # Resolve the clinician's user_service id ONCE, here on the write path, so
    # every later practitioner read is a local comparison (see
    # doctor_directory.py for why this is not done at read time). A None result
    # is stored as NULL and NULL denies — the doctor loses this row from their
    # schedule, which the backfill script repairs. It does NOT fail the
    # booking: the patient's slot is the thing that must survive.
    doctor_user_id = await resolve_doctor_user_id(payload.doctor_id, authorization=authorization)
    if doctor_user_id is None:
        # No patient identifier in this line — doctor_id is a public directory
        # id, and that is all the operator needs to run the backfill.
        log.warning(
            "booking_doctor_link_unresolved",
            extra={"doctor_id": str(payload.doctor_id)},
        )

    booking = Booking(
        user_id=user_id,
        doctor_id=payload.doctor_id,
        doctor_user_id=doctor_user_id,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        status=BookingStatus.BOOKED.value,
        mode=payload.mode.value,
        reason=_normalize_text(payload.reason),
        notes=_normalize_text(payload.notes),
    )
    db.add(booking)
    await db.flush()

    # Video provisioning happens AFTER the flush (the booking needs its id to
    # be the room's `booking_id`) and is deliberately not part of the booking's
    # success condition: `provision_room` never raises, and a None result
    # leaves `room_id` NULL. An in-person booking never touches
    # telemedicine_service at all.
    if booking.mode == BookingMode.VIDEO.value:
        booking.room_id = await provision_room(booking, authorization=authorization)
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
    """List bookings where the caller is the PATIENT (or everything, for admin).

    Authorization rule, in full:
      * `all_bookings=true` -> role must be `admin`, otherwise 403.
      * otherwise -> `Booking.user_id == principal.subject`. Full stop.

    `doctor_id` is a FILTER, NEVER AN AUTHORIZATION INPUT. It narrows a set the
    caller is already entitled to (their own bookings, or an admin's
    everything); it can never widen one. This used to be the bug: a clinician
    passing their own profile id here got "bookings where I am the patient AND
    the doctor is me", which is nonsense, and the natural "fix" of authorising
    on the parameter would have let any clinician read any other clinician's
    patients by changing one UUID. The practitioner view is
    `list_practitioner_schedule` below, which takes no id from the client at
    all.
    """
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


def _require_practitioner(principal: Principal) -> UUID:
    """Return the caller's user id, having proved they may act as a clinician.

    The returned id is taken from the verified token and from nowhere else.
    There is no code path by which a client-supplied value reaches the
    practitioner WHERE clause — that is the whole point of this function
    existing instead of a boolean check at the call site.
    """
    if principal.role not in PRACTITIONER_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "practitioner access required")
    return _principal_uuid(principal)


async def list_practitioner_schedule(
    db: AsyncSession,
    principal: Principal,
    *,
    status_filter: BookingStatus | None = None,
) -> BookingScheduleList:
    """List bookings where the caller is the CLINICIAN.

    Authorization rule, in full:
      * role must be in `PRACTITIONER_ROLES`, otherwise 403; and
      * `Booking.doctor_user_id == principal.subject`.

    Both operands come from the verified token and this service's own table.
    **The caller supplies no identifier of any kind**, so there is no id to
    tamper with and the endpoint has no IDOR surface: a doctor cannot express
    "show me someone else's schedule" in the request at all.

    Fail-closed on unresolved links: `doctor_user_id IS NULL` rows are excluded
    automatically, because SQL `NULL = <uuid>` is NULL, never true. That is
    load-bearing, not incidental — a NULL is "we do not know which clinician
    this is", and the safe answer to that is nobody. `test_practitioner_schedule
    .py::test_null_doctor_user_id_row_is_invisible` pins it so a future
    refactor to `or_(...)` cannot quietly turn NULL into a wildcard.

    Returns the minimised `BookingScheduleOut` projection, not `BookingOut`;
    see that model's docstring for what is left out and why.
    """
    practitioner_user_id = _require_practitioner(principal)

    stmt = select(Booking).where(Booking.doctor_user_id == practitioner_user_id)
    if status_filter is not None:
        stmt = stmt.where(Booking.status == status_filter.value)
    stmt = stmt.order_by(Booking.starts_at.asc())
    result = await db.scalars(stmt)
    items = [
        BookingScheduleOut(
            booking_id=booking.id,
            patient_id=booking.user_id,
            starts_at=booking.starts_at,
            ends_at=booking.ends_at,
            status=BookingStatus(booking.status),
            mode=BookingMode(booking.mode),
            room_id=booking.room_id,
        )
        for booking in result.all()
    ]
    return BookingScheduleList(items=items)


async def get_practitioner_schedule_summary(
    db: AsyncSession,
    principal: Principal,
) -> BookingScheduleSummaryOut:
    """Counts plus the next three consultations, for the practitioner home card.

    Same authorization rule as `list_practitioner_schedule` — it delegates, so
    the rule cannot drift between the two endpoints.
    """
    schedule = await list_practitioner_schedule(db, principal)
    now = datetime.now(tz=timezone.utc)
    booked = [item for item in schedule.items if item.status == BookingStatus.BOOKED]
    cancelled = [item for item in schedule.items if item.status == BookingStatus.CANCELLED]
    upcoming = [item for item in booked if _as_utc(item.starts_at) >= now][:3]
    return BookingScheduleSummaryOut(
        total_count=len(schedule.items),
        booked_count=len(booked),
        cancelled_count=len(cancelled),
        upcoming_bookings=upcoming,
    )


async def get_booking_summary(
    db: AsyncSession,
    principal: Principal,
    *,
    all_bookings: bool = False,
    doctor_id: UUID | None = None,
) -> BookingSummaryOut:
    """Patient-side summary. Delegates, so it shares `list_bookings`' rule.

    Sharing the rule by delegation is the point: this function used to have the
    identical `doctor_id` gap, because the check was duplicated rather than
    reused. The practitioner counterpart is
    `get_practitioner_schedule_summary`.
    """
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


async def get_booking(
    db: AsyncSession,
    principal: Principal,
    booking_id: UUID,
    *,
    require_write: bool = False,
) -> Booking:
    """Fetch one booking, enforcing read or write access.

    `require_write=True` is the narrower rule (patient/admin); the default is
    the read rule, which also admits the treating clinician.
    """
    booking = await db.get(Booking, booking_id)
    if not booking:
        raise BookingError("booking not found")
    if require_write:
        _can_manage_booking(principal, booking)
    else:
        _can_read_booking(principal, booking)
    return booking


async def cancel_booking(
    db: AsyncSession,
    principal: Principal,
    booking_id: UUID,
    payload: BookingCancel,
) -> Booking:
    booking = await get_booking(db, principal, booking_id, require_write=True)
    if booking.status == BookingStatus.CANCELLED.value:
        raise BookingError("booking is already cancelled")
    booking.status = BookingStatus.CANCELLED.value
    booking.cancelled_at = datetime.now(tz=timezone.utc)
    booking.cancellation_reason = _normalize_text(payload.cancellation_reason)
    await db.flush()
    await db.refresh(booking)
    return booking
