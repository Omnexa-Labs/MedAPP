from datetime import date, datetime
from uuid import UUID

from shared.db import Base, TimestampMixin
from sqlalchemy import JSON, Date, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column


class ClinicalPrescription(Base, TimestampMixin):
    __tablename__ = "clinical_prescriptions"
    __table_args__ = (Index("ix_clinical_rx_patient_created", "patient_id", "created_at", "id"),)
    patient_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("patients.id"))
    author_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    approval_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True))
    prescriber_name: Mapped[str] = mapped_column(String(511))
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(16), default="draft")
    items: Mapped[list] = mapped_column(JSON)
    clinical_goal: Mapped[str] = mapped_column(String(500), default="")
    valid_until: Mapped[date] = mapped_column(Date)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    change_reason: Mapped[str | None] = mapped_column(String(500))
    replaces_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("clinical_prescriptions.id"), unique=True
    )
    pharmacy_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))


class PrescriptionRequest(Base, TimestampMixin):
    __tablename__ = "prescription_requests"
    actor_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True))
    request_hash: Mapped[str] = mapped_column(String(64))
    response: Mapped[dict | None] = mapped_column(JSON)


class PrescriptionDelivery(Base, TimestampMixin):
    __tablename__ = "prescription_deliveries"
    __table_args__ = (
        UniqueConstraint("prescription_id", "operation", name="uq_clinical_rx_delivery_operation"),
        Index("ix_clinical_rx_delivery_due", "state", "next_attempt_at"),
    )
    prescription_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("clinical_prescriptions.id")
    )
    operation: Mapped[str] = mapped_column(String(16))
    payload: Mapped[dict] = mapped_column(JSON)
    state: Mapped[str] = mapped_column(String(16), default="queued")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    lease_token: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    error_code: Mapped[str | None] = mapped_column(String(64))
    acknowledgement: Mapped[dict | None] = mapped_column(JSON)
