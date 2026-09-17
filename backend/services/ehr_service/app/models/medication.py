from datetime import date, datetime
from uuid import UUID

from shared.db import Base, TimestampMixin
from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column


class MedicationCourse(Base, TimestampMixin):
    __tablename__ = "medication_courses"
    __table_args__ = (
        UniqueConstraint("prescription_id", "prescription_item", name="uq_medication_rx_item"),
        Index("ix_medication_patient_created", "patient_id", "created_at", "id"),
        Index("ix_medication_reminder_courses", "reminders_enabled", "status", "id"),
    )
    patient_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("patients.id"))
    prescription_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("clinical_prescriptions.id")
    )
    prescription_item: Mapped[int | None] = mapped_column(Integer)
    medicine: Mapped[dict] = mapped_column(JSON)
    source: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(16), default="active")
    version: Mapped[int] = mapped_column(Integer, default=1)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    timezone: Mapped[str] = mapped_column(String(64))
    daily_times: Mapped[list] = mapped_column(JSON)
    schedule_changes: Mapped[list] = mapped_column(JSON, default=list)
    reminders_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    reminders_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class MedicationDose(Base, TimestampMixin):
    __tablename__ = "medication_doses"
    __table_args__ = (
        UniqueConstraint("course_id", "slot", name="uq_medication_dose_slot"),
        Index("ix_medication_dose_course_day", "course_id", "day", "id"),
    )
    course_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("medication_courses.id")
    )
    slot: Mapped[str] = mapped_column(String(80))
    day: Mapped[date] = mapped_column(Date)
    time: Mapped[str | None] = mapped_column(String(5))
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    outcome: Mapped[str] = mapped_column(String(16))
    note: Mapped[str] = mapped_column(String(500), default="")
    version: Mapped[int] = mapped_column(Integer, default=1)


class MedicationEvent(Base, TimestampMixin):
    __tablename__ = "medication_events"
    __table_args__ = (Index("ix_medication_event_course_created", "course_id", "created_at", "id"),)
    course_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("medication_courses.id")
    )
    kind: Mapped[str] = mapped_column(String(24))
    payload: Mapped[dict] = mapped_column(JSON)


class MedicationRequest(Base, TimestampMixin):
    __tablename__ = "medication_requests"
    actor_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True))
    request_hash: Mapped[str] = mapped_column(String(64))
    response: Mapped[dict | None] = mapped_column(JSON)


class MedicationReminderDevice(Base, TimestampMixin):
    __tablename__ = "medication_reminder_devices"
    __table_args__ = (Index("ix_medication_device_owner", "patient_id", "enabled"),)
    patient_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("patients.id"))
    push_token: Mapped[str] = mapped_column(String(255), unique=True)
    binding_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class MedicationReminderAttempt(Base, TimestampMixin):
    __tablename__ = "medication_reminder_attempts"
    __table_args__ = (
        UniqueConstraint(
            "course_id", "device_id", "scheduled_at", name="uq_medication_reminder_slot"
        ),
        Index("ix_medication_reminder_history", "course_id", "created_at", "id"),
    )
    course_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("medication_courses.id")
    )
    device_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("medication_reminder_devices.id")
    )
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    state: Mapped[str] = mapped_column(String(24), default="unconfirmed")
    provider_reference: Mapped[str | None] = mapped_column(String(255))
    error_code: Mapped[str | None] = mapped_column(String(64))
