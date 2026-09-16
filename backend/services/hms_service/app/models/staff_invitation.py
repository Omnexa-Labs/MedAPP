from datetime import datetime
from uuid import UUID

from shared.db import Base, TimestampMixin
from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column


class StaffInvitation(Base, TimestampMixin):
    __tablename__ = "staff_invitations"
    __table_args__ = (Index("ix_staff_invitations_tenant_created", "tenant_id", "created_at"),)

    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenant_registry.id"), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    hms_role: Mapped[str] = mapped_column(String(32), nullable=False)
    staff_data: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_by: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    creator_version: Mapped[int] = mapped_column(Integer, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_by: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    membership_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    staff_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))


class StaffAccessEvent(Base, TimestampMixin):
    __tablename__ = "staff_access_events"
    __table_args__ = (Index("ix_staff_access_events_tenant_created", "tenant_id", "created_at"),)

    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenant_registry.id"), nullable=False)
    actor_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    details: Mapped[dict] = mapped_column(JSON, nullable=False)
