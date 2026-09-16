"""Directory offerings minus bookings; no patient information crosses this API."""
from datetime import date, datetime, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, AwareDatetime, ValidationError, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Booking
from .doctor_directory import _build_client


class OfferedSlot(BaseModel):
    doctor_id: UUID
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    timezone: str

    @field_validator("timezone")
    @classmethod
    def valid_zone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("invalid slot timezone") from exc
        return value


async def offered_slots(doctor_id: UUID, from_date: date, to_date: date,
                        *, authorization: str | None = None) -> list[OfferedSlot]:
    if from_date > to_date or (to_date - from_date).days > 30:
        raise HTTPException(400, "request 1 to 31 calendar days")
    try:
        async with _build_client() as client:
            response = await client.get(
                f"/v1/doctors/{doctor_id}/slots",
                params={"from_date": from_date.isoformat(), "to_date": to_date.isoformat(),
                        "slot_minutes": 30},
                headers={"Authorization": authorization} if authorization else {},
            )
        if response.status_code != 200:
            raise HTTPException(503, "Clinician availability is unavailable. Try again.")
        slots = [OfferedSlot.model_validate(item) for item in response.json()["items"]]
        if any(s.doctor_id != doctor_id or s.starts_at >= s.ends_at for s in slots):
            raise ValueError("invalid offering")
        return slots
    except (httpx.HTTPError, ValidationError, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(503, "Clinician availability is unavailable. Try again.") from exc


async def ensure_offered(doctor_id: UUID, starts_at: datetime, ends_at: datetime,
                         *, authorization: str | None) -> None:
    # UTC dates may differ from the provider's date by one day.
    day = starts_at.astimezone(timezone.utc).date()
    slots = await offered_slots(doctor_id, day - timedelta(days=1), day + timedelta(days=1),
                                authorization=authorization)
    if not any(s.starts_at == starts_at and s.ends_at == ends_at for s in slots):
        raise HTTPException(409, "That time is no longer offered. Choose another slot.")


async def available_slots(db: AsyncSession, doctor_id: UUID, from_date: date, to_date: date,
                          *, authorization: str | None) -> list[OfferedSlot]:
    now = datetime.now(timezone.utc)
    slots = [s for s in await offered_slots(doctor_id, from_date, to_date,
                                            authorization=authorization) if s.starts_at > now]
    if not slots:
        return []
    windows = (await db.execute(select(Booking.starts_at, Booking.ends_at).where(
        Booking.doctor_id == doctor_id, Booking.status == "booked",
        Booking.starts_at < max(s.ends_at for s in slots),
        Booking.ends_at > min(s.starts_at for s in slots),
    ))).all()
    def utc(value):
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
    return [s for s in slots if not any(utc(start) < s.ends_at and utc(end) > s.starts_at
                                      for start, end in windows)]
