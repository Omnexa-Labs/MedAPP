from __future__ import annotations

from uuid import UUID

from sqlalchemy import Boolean, Date, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base, TimestampMixin


class Drug(Base, TimestampMixin):
    __tablename__ = "drugs"

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    brand_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    category: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    form: Mapped[str] = mapped_column(String(64), nullable=False)
    strength: Mapped[str] = mapped_column(String(64), nullable=False)
    unit: Mapped[str] = mapped_column(String(32), nullable=False)
    reorder_level: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)

    @property
    def drug_id(self) -> UUID:
        return self.id


class DrugBatch(Base, TimestampMixin):
    __tablename__ = "drug_batches"

    drug_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    batch_number: Mapped[str] = mapped_column(String(64), nullable=False)
    quantity_received: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_remaining: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_cost_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    selling_price_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="GHS")
    supplier: Mapped[str | None] = mapped_column(String(255), nullable=True)
    received_at: Mapped[str] = mapped_column(Date, nullable=False)
    expiry_date: Mapped[str] = mapped_column(Date, nullable=False, index=True)


class Prescription(Base, TimestampMixin):
    __tablename__ = "prescriptions"

    visit_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    patient_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    prescribed_by_staff_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    @property
    def prescription_id(self) -> UUID:
        return self.id


class PrescriptionItem(Base, TimestampMixin):
    __tablename__ = "prescription_items"

    prescription_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    drug_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    dosage: Mapped[str] = mapped_column(String(128), nullable=False)
    quantity_prescribed: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_dispensed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    instructions: Mapped[str | None] = mapped_column(String(512), nullable=True)


class Dispensing(Base, TimestampMixin):
    __tablename__ = "dispensings"

    prescription_item_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    drug_batch_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    dispensed_by_staff_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    dispensed_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)
