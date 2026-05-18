from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class BookingStatus(StrEnum):
    BOOKED = "booked"
    CANCELLED = "cancelled"


class BookingBase(BaseModel):
    doctor_id: UUID
    starts_at: datetime
    ends_at: datetime
    reason: str | None = Field(default=None, max_length=255)
    notes: str | None = None


class BookingCreate(BookingBase):
    pass


class BookingCancel(BaseModel):
    cancellation_reason: str | None = None


class BookingOut(BookingBase):
    model_config = ConfigDict(from_attributes=True)

    booking_id: UUID
    user_id: UUID
    status: BookingStatus
    cancelled_at: datetime | None = None
    cancellation_reason: str | None = None


class BookingList(BaseModel):
    items: list[BookingOut] = Field(default_factory=list)
