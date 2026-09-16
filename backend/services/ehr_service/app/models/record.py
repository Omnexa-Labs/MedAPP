from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from shared.db.base import Base, TimestampMixin


class PatientRecord(Base, TimestampMixin):
    __tablename__ = "patients"

    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, unique=True, index=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    @property
    def patient_id(self) -> UUID:
        return self.id


class VitalReading(Base, TimestampMixin):
    __tablename__ = "vitals"
    __table_args__ = (Index("ix_vitals_patient_timeline", "patient_id", "recorded_at", "id"),)

    patient_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    recorded_by_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    value: Mapped[str] = mapped_column(String(128), nullable=False)
    unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    @property
    def vital_id(self) -> UUID:
        return self.id


class Consent(Base, TimestampMixin):
    __tablename__ = "consents"
    __table_args__ = (
        Index("uq_active_patient_doctor_scope", "patient_id", "doctor_user_id", "scope",
              unique=True, postgresql_where=text("revoked_at IS NULL"), sqlite_where=text("revoked_at IS NULL")),
        Index("ix_consents_patient_granted", "patient_id", "granted_at", "id"),
    )

    patient_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    doctor_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    scope: Mapped[str] = mapped_column(String(64), nullable=False, default="records")
    granted_by_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    revoked_by_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True, index=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    clinician_display_name: Mapped[str | None] = mapped_column(String(511), nullable=True)
    clinician_role: Mapped[str | None] = mapped_column(String(16), nullable=True)
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    @property
    def consent_id(self) -> UUID:
        return self.id


class AccessAudit(Base, TimestampMixin):
    __tablename__ = "access_audit"

    accessor_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    patient_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    resource: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    reason: Mapped[str] = mapped_column(String(255), nullable=False)

    @property
    def audit_id(self) -> UUID:
        return self.id
