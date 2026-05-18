from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base, TimestampMixin


class LabOrder(Base, TimestampMixin):
    __tablename__ = "lab_orders"

    patient_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    ordered_by_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    test_name: Mapped[str] = mapped_column(String(255), nullable=False)
    priority: Mapped[str] = mapped_column(String(32), nullable=False, default="routine", index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="ordered", index=True)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def order_id(self):
        return self.id


class LabResult(Base, TimestampMixin):
    __tablename__ = "lab_results"

    patient_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    lab_order_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True, index=True)
    uploaded_by_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(64), nullable=False, default="patient_upload", index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    storage_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    parsed_values: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    resulted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="available", index=True)

    @property
    def result_id(self):
        return self.id


class PartnerLab(Base, TimestampMixin):
    __tablename__ = "partner_labs"

    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    slug: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    integration_type: Mapped[str] = mapped_column(String(64), nullable=False, default="manual")
    external_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)