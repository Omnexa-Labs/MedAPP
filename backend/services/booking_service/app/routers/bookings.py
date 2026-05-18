from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal, get_current_principal

from ..deps import DbSession
from ..schemas.booking import BookingCancel, BookingCreate, BookingList, BookingOut, BookingStatus
from ..services import BookingError, cancel_booking, create_booking, get_booking, list_bookings

router = APIRouter(prefix="/v1/bookings", tags=["Booking"])


@router.post("", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
async def create(
    payload: BookingCreate,
    principal: Principal = Depends(get_current_principal),
    db: AsyncSession = DbSession,
) -> BookingOut:
    try:
        booking = await create_booking(db, principal, payload)
    except BookingError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return BookingOut.model_validate(booking)


@router.get("", response_model=BookingList)
async def index(
    all_bookings: bool = Query(default=False),
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
