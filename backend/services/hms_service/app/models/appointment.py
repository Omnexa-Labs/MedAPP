from __future__ import annotations

from uuid import UUID

from sqlalchemy import Date, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base, TimestampMixin


class Appointment(Base, TimestampMixin):
    __tablename__ = "appointments"

    patient_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    doctor_staff_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    department_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    appointment_type: Mapped[str] = mapped_column(String(32), nullable=False, default="scheduled")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="booked", index=True)
    scheduled_date: Mapped[str] = mapped_column(Date, nullable=False, index=True)
    scheduled_start: Mapped[str] = mapped_column(String(8), nullable=False)
    scheduled_end: Mapped[str] = mapped_column(String(8), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(512), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancelled_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(String(512), nullable=True)

    @property
    def appointment_id(self) -> UUID:
        return self.id


class QueueEntry(Base, TimestampMixin):
    __tablename__ = "queue_entries"

    patient_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    visit_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    department_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True, index=True)
    assigned_staff_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    queue_type: Mapped[str] = mapped_column(String(32), nullable=False, default="walk_in")
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="waiting", index=True)
    ticket_number: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    joined_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)
    called_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    estimated_wait_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    @property
    def queue_entry_id(self) -> UUID:
        return self.id
