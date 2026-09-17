from datetime import datetime
from uuid import UUID

from shared.db import Base, TimestampMixin
from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column


class PharmacyPrescription(Base, TimestampMixin):
    __tablename__ = "pharmacy_prescriptions"
    __table_args__ = (
        UniqueConstraint("pharmacy_id", "pms_prescription_id", name="uq_pharmacy_pms_prescription"),
        UniqueConstraint("pharmacy_id", "external_ref", name="uq_pharmacy_prescription_external"),
        Index("ix_pharmacy_prescriptions_patient_updated", "patient_id", "updated_at", "id"),
    )
    pharmacy_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("pharmacy_profiles.id")
    )
    pms_prescription_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True))
    patient_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True))
    external_ref: Mapped[str] = mapped_column(String(128))
    sequence: Mapped[int] = mapped_column(Integer)
    snapshot: Mapped[dict] = mapped_column(JSON)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PharmacyPrescriptionEvent(Base, TimestampMixin):
    __tablename__ = "pharmacy_prescription_events"
    __table_args__ = (
        UniqueConstraint(
            "prescription_id", "sequence", name="uq_pharmacy_prescription_event_sequence"
        ),
    )
    prescription_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("pharmacy_prescriptions.id"), index=True
    )
    sequence: Mapped[int] = mapped_column(Integer)
    payload_hash: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSON)
    acknowledgement: Mapped[dict] = mapped_column(JSON)
