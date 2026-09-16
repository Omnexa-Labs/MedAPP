from __future__ import annotations

from uuid import UUID
from datetime import date

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal, get_current_principal

from ..deps import DbSession, RateLimiterDep
from ..schemas.booking import (
    BookingCancel,
    BookingCreate,
    BookingList,
    BookingOut,
    BookingScheduleList,
    BookingScheduleSummaryOut,
    BookingStatus,
    BookingSummaryOut,
)
from ..services import (
    BookingError,
    BookingRateLimiter,
    cancel_booking,
    create_booking,
    get_booking,
    get_booking_summary,
    get_practitioner_schedule_summary,
    list_bookings,
    list_practitioner_schedule,
)

router = APIRouter(prefix="/v1/bookings", tags=["Booking"])


@router.get("/slots")
async def available(
    doctor_id: UUID, from_date: date, to_date: date, response: Response,
    principal: Principal = Depends(get_current_principal),
    db: AsyncSession = DbSession,
    authorization: str | None = Header(default=None),
):
    from ..services.availability import available_slots
    response.headers["Cache-Control"] = "no-store"
    return {"items": await available_slots(db, doctor_id, from_date, to_date,
                                          authorization=authorization)}


@router.post("/{booking_id}/reschedule", response_model=BookingOut)
async def reschedule(
    booking_id: UUID, payload: BookingCreate,
    principal: Principal = Depends(get_current_principal),
    db: AsyncSession = DbSession,
    limiter: BookingRateLimiter = RateLimiterDep,
    authorization: str | None = Header(default=None),
) -> BookingOut:
    from ..services.booking_service import reschedule_booking
    if principal.role != "admin":
        await limiter.check(principal.subject)
    try:
        booking = await reschedule_booking(db, principal, booking_id, payload,
                                            authorization=authorization)
    except BookingError as exc:
        raise HTTPException(400, str(exc)) from exc
    return BookingOut.model_validate(booking)


@router.post("", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
async def create(
    payload: BookingCreate,
    principal: Principal = Depends(get_current_principal),
    db: AsyncSession = DbSession,
    limiter: BookingRateLimiter = RateLimiterDep,
    # Forwarded verbatim to telemedicine_service when mode=video. Read here
    # rather than reconstructed, because there is no service account in this
    # system and the patient is genuinely the room's creator.
    authorization: str | None = Header(default=None),
) -> BookingOut:
    # Audit finding B-22: gate creation BEFORE the conflict-check query
    # so an attacker can't hot-loop expensive DB work for free. Admins
    # bypass — operator workflows (bulk imports, support scripts) should
    # not trip a guard aimed at end-user abuse.
    if principal.role != "admin":
        await limiter.check(principal.subject)
    try:
        booking = await create_booking(db, principal, payload, authorization=authorization)
    except BookingError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return BookingOut.model_validate(booking)


@router.get("", response_model=BookingList)
async def index(
    all_bookings: bool = Query(default=False),
    # FILTER ONLY — this value never authorises anything. It is a
    # doctor_service profile id, which is not comparable to a token subject, so
    # it cannot prove the caller is that clinician. A practitioner wanting
    # their own schedule uses GET /v1/bookings/schedule, which takes no id.
    doctor_id: UUID | None = None,
    status_filter: BookingStatus | None = Query(default=None, alias="status"),
    principal: Principal = Depends(get_current_principal),
    db: AsyncSession = DbSession,
) -> BookingList:
    return await list_bookings(
        db,
        principal,
        all_bookings=all_bookings,
        doctor_id=doctor_id,
        status_filter=status_filter,
    )


@router.get("/summary", response_model=BookingSummaryOut)
async def summary(
    all_bookings: bool = Query(default=False),
    doctor_id: UUID | None = None,
    principal: Principal = Depends(get_current_principal),
    db: AsyncSession = DbSession,
) -> BookingSummaryOut:
    return await get_booking_summary(db, principal, all_bookings=all_bookings, doctor_id=doctor_id)


# Both practitioner routes are declared BEFORE `/{booking_id}`, for the same
# reason `/summary` is: a literal segment registered after a UUID path param
# would be swallowed by it and answer 422.
@router.get("/schedule", response_model=BookingScheduleList)
async def practitioner_schedule(
    status_filter: BookingStatus | None = Query(default=None, alias="status"),
    principal: Principal = Depends(get_current_principal),
    db: AsyncSession = DbSession,
) -> BookingScheduleList:
    """The caller's own schedule as the treating clinician.

    Takes NO identifier. "Whose schedule" is answered entirely by the verified
    token, which is what removes the IDOR that an authorising `?doctor_id=`
    would have created. Returns the minimised schedule projection — no clinical
    free text; see `BookingScheduleOut`.
    """
    return await list_practitioner_schedule(db, principal, status_filter=status_filter)


@router.get("/schedule/summary", response_model=BookingScheduleSummaryOut)
async def practitioner_schedule_summary(
    principal: Principal = Depends(get_current_principal),
    db: AsyncSession = DbSession,
) -> BookingScheduleSummaryOut:
    """Counts plus the next three consultations, for the practitioner home card."""
    return await get_practitioner_schedule_summary(db, principal)


@router.get("/{booking_id}", response_model=BookingOut)
async def read(
    booking_id: UUID,
    principal: Principal = Depends(get_current_principal),
    db: AsyncSession = DbSession,
) -> BookingOut:
    try:
        booking = await get_booking(db, principal, booking_id)
    except BookingError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return BookingOut.model_validate(booking)


@router.post("/{booking_id}/cancel", response_model=BookingOut)
async def cancel(
    booking_id: UUID,
    payload: BookingCancel,
    principal: Principal = Depends(get_current_principal),
    db: AsyncSession = DbSession,
) -> BookingOut:
    try:
        booking = await cancel_booking(db, principal, booking_id, payload)
    except BookingError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return BookingOut.model_validate(booking)
