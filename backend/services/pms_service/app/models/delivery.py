from datetime import datetime
from uuid import UUID

from shared.db import Base, TimestampMixin
from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column


class MedAppDelivery(Base, TimestampMixin):
    __tablename__ = "medapp_deliveries"
    __table_args__ = (
        UniqueConstraint("prescription_id", "sequence", name="uq_medapp_delivery_sequence"),
        Index("ix_medapp_delivery_due", "state", "next_attempt_at"),
        Index("ix_medapp_delivery_lease", "state", "leased_until"),
    )
    prescription_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("prescriptions.id"), index=True
    )
    sequence: Mapped[int] = mapped_column(Integer)
    payload: Mapped[dict] = mapped_column(JSON)
    state: Mapped[str] = mapped_column(String(24), default="pending", server_default="pending")
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    leased_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lease_token: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(64), nullable=True)
