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


class BookingScheduleOut(BaseModel):
    """One entry in a practitioner's own schedule — a MINIMISED projection.

    This is deliberately not `BookingOut`. Act 843's data-minimisation duty and
    the HIPAA "minimum necessary" standard both point the same way: a schedule
    list needs to answer *when, with whom, how, and is it still on* — nothing
    else. The clinician is the treating practitioner, so they are entitled to
    the clinical detail, but not from a list endpoint that returns every
    patient at once; they get it from `GET /v1/bookings/{booking_id}` for the
    one patient they are actually seeing, which is also the read a future audit
    log can meaningfully record.

    Included, with the reason each is necessary:
      booking_id  — the handle for the detail read and for cancellation.
      patient_id  — the only way the client can open the right patient. It is
                    an opaque user id, not a name: booking_service has no name
                    for anyone, and resolving one here would turn a schedule
                    into a patient list.
      starts_at / ends_at — the schedule grid itself.
      status      — a cancelled row must render struck through, not silently
                    vanish, or the clinician cannot tell "cancelled" from
                    "never booked".
      mode        — decides whether the row offers a room or an address.
      room_id     — the join handle for a video consultation.

    Excluded, on purpose:
      reason, notes, cancellation_reason — free-text clinical PHI. `notes` in
                    particular is the highest-sensitivity field on the row, and
                    a list endpoint would spray every patient's notes into one
                    response body, into client caches and into any proxy that
                    logs bodies. Fetch the detail for the patient in front of
                    you.
      doctor_id / doctor_user_id — always the caller; echoing them back adds
                    nothing and needlessly restates the identifier the
                    authorization decision used.
      created_at / updated_at — record-keeping metadata with no schedule use.
    """

    model_config = ConfigDict(from_attributes=True)

    booking_id: UUID
    # Named `patient_id`, not `user_id`: in the practitioner's frame the other
    # party is the patient, and the ambiguity of "user" on a screen where the
    # user is the doctor has already caused one bug in this repo's clients.
    patient_id: UUID
    starts_at: datetime
    ends_at: datetime
    status: BookingStatus
    mode: BookingMode
    room_id: UUID | None = None


class BookingScheduleList(BaseModel):
    items: list[BookingScheduleOut] = Field(default_factory=list)


class BookingScheduleSummaryOut(BaseModel):
    """Practitioner counterpart of `BookingSummaryOut`.

    A separate model rather than reusing `BookingSummaryOut` because that one
    embeds `BookingOut`, and embedding the unminimised shape inside the
    "next consultation" card would undo the minimisation above for the three
    rows a clinician looks at most often.
    """

    total_count: int = 0
    booked_count: int = 0
    cancelled_count: int = 0
    upcoming_bookings: list[BookingScheduleOut] = Field(default_factory=list)
