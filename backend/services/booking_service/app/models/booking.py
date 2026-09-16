from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base, TimestampMixin


class Booking(Base, TimestampMixin):
    __tablename__ = "bookings"

    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    doctor_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    # The user_service USER id of the clinician, denormalised from
    # doctor_service at creation time. `doctor_id` above is a doctor_service
    # PROFILE id in a different id space from `Principal.subject`, so it can
    # never be compared to a token subject — that mismatch is what made
    # `?doctor_id=` an IDOR. This column is the only thing a practitioner read
    # authorises on, and the comparison is local: no network call decides
    # access. See services/doctor_directory.py for the rejected alternatives.
    #
    # Nullable for historical unresolved rows. New bookings require resolution;
    # historical NULLs deny clinician access until explicitly backfilled.
    doctor_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True, index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="booked", index=True)
    # Consultation modality. String(16) + a Pydantic StrEnum at the boundary,
    # not a PG ENUM, for the same two reasons `status` above is a String: it
    # keeps this table consistent with every other service in the repo, and a
    # third modality (phone, home visit) can ship as one deploy instead of an
    # `ALTER TYPE ... ADD VALUE` that cannot run inside a migration
    # transaction. NOT NULL because from now on the booking screen always
    # forces the choice — a nullable mode would make every client branch
    # three-way with an "unknown" case no frame depicts.
    mode: Mapped[str] = mapped_column(String(16), nullable=False, default="in_person", index=True)
    # The telemedicine room for a video booking. Nullable on purpose, and
    # nullable is a REPRESENTABLE STATE, not an accident: a video booking
    # whose room provisioning failed keeps room_id NULL (see
    # services/telemedicine.py) so the booking itself survives. No FK — the
    # room lives in telemedicine_service's own database.
    room_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    rescheduled_from_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True, unique=True)

    @property
    def booking_id(self):
        return self.id
