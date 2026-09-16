from datetime import datetime
from uuid import UUID

from shared.db import Base, TimestampMixin
from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column


class ApplicationActivation(Base, TimestampMixin):
    __tablename__ = "application_activations"
    __table_args__ = (Index("ix_application_activations_due", "state", "next_attempt_at"),)
    application_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("partner_applications.id"), unique=True, nullable=False
    )
    approval_version: Mapped[int] = mapped_column(Integer, nullable=False)
    target: Mapped[str] = mapped_column(String(32), nullable=False)
    state: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    command_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_error: Mapped[str | None] = mapped_column(String(64), nullable=True)
    profile_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
