from __future__ import annotations

from uuid import UUID

from sqlalchemy import Boolean, Date, DateTime, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base, TimestampMixin


class Patient(Base, TimestampMixin):
    __tablename__ = "patients"

    medapp_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True, index=True)
    mrn: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    first_name: Mapped[str] = mapped_column(String(128), nullable=False)
    last_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    other_names: Mapped[str | None] = mapped_column(String(128), nullable=True)
    date_of_birth: Mapped[str | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(16), nullable=True)
    blood_group: Mapped[str | None] = mapped_column(String(8), nullable=True)
    phone_primary: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    phone_secondary: Mapped[str | None] = mapped_column(String(32), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address: Mapped[str | None] = mapped_column(String(512), nullable=True)
    city: Mapped[str | None] = mapped_column(String(128), nullable=True)
    region: Mapped[str | None] = mapped_column(String(128), nullable=True)
    national_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    insurance_provider: Mapped[str | None] = mapped_column(String(128), nullable=True)
    insurance_policy_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    emergency_contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    emergency_contact_relationship: Mapped[str | None] = mapped_column(String(64), nullable=True)
    allergies_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    chronic_conditions_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)

    @property
    def patient_id(self) -> UUID:
        return self.id


class Visit(Base, TimestampMixin):
    __tablename__ = "visits"

    patient_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    visit_type: Mapped[str] = mapped_column(String(32), nullable=False, default="outpatient")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="registered", index=True)
    department_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    assigned_doctor_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True, index=True)
    chief_complaint: Mapped[str | None] = mapped_column(Text, nullable=True)
    diagnosis: Mapped[str | None] = mapped_column(Text, nullable=True)
    treatment_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    vitals_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    checked_in_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    checked_out_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def visit_id(self) -> UUID:
        return self.id
