from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class BookingStatus(StrEnum):
    BOOKED = "booked"
    CANCELLED = "cancelled"


class BookingMode(StrEnum):
    """The consultation modality the patient chose.

    Two values today. An unknown string is a 422, not a silent coercion to
    the default — a client that sends `"telehealth"` has a bug, and answering
    201 with `mode="in_person"` would hide it until a patient travelled to a
    clinic for a video appointment.
    """

    IN_PERSON = "in_person"
    VIDEO = "video"


class BookingBase(BaseModel):
    doctor_id: UUID
    starts_at: datetime
    ends_at: datetime
    reason: str | None = Field(default=None, max_length=255)
    notes: str | None = None


class BookingCreate(BookingBase):
    # Defaulted rather than required so the four existing callers of
    # POST /v1/bookings that predate the field keep working; the mobile
    # booking flow always sends it explicitly.
    mode: BookingMode = BookingMode.IN_PERSON


class BookingCancel(BaseModel):
    cancellation_reason: str | None = None


class BookingOut(BookingBase):
    model_config = ConfigDict(from_attributes=True)

    booking_id: UUID
    user_id: UUID
    status: BookingStatus
    mode: BookingMode
    # The telemedicine room handle, or null. NOT a URL: telemedicine_service
    # has no URL concept — a client joins with
    # `GET /v1/rooms/{room_id}/token` then `POST /v1/rooms/{room_id}/join`,
    # and builds its own in-app route from the id. Synthesising a `join_url`
    # would require a public base URL that does not exist in this system.
    #
    # Null is legal on a video booking and means "no room yet" — either
    # provisioning failed or has not been attempted. Clients render
    # "video link pending", never a dead join button.
    room_id: UUID | None = None
    cancelled_at: datetime | None = None
    cancellation_reason: str | None = None


class BookingList(BaseModel):
    items: list[BookingOut] = Field(default_factory=list)


class BookingSummaryOut(BaseModel):
    total_count: int = 0
    booked_count: int = 0
    cancelled_count: int = 0
    upcoming_bookings: list[BookingOut] = Field(default_factory=list)
