from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base, TimestampMixin


class EventLog(Base, TimestampMixin):
    __tablename__ = "event_log"
    __table_args__ = (UniqueConstraint("event_id", name="uq_event_log_event_id"),)

    event_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    event_type: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(255), nullable=False)
    subject_hash: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    booking_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True, index=True)
    doctor_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True, index=True)
    payment_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True, index=True)
    amount_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    currency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    status: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    metadata_json: Mapped[dict | None] = mapped_column("metadata_json", JSON, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    @property
    def log_id(self):
        return self.id