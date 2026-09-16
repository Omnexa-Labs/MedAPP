from uuid import UUID

from shared.db import Base, TimestampMixin
from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column


class MedAppWorkspace(Base, TimestampMixin):
    __tablename__ = "medapp_workspace"
    __table_args__ = (CheckConstraint("singleton = 1", name="ck_medapp_workspace_singleton"),)
    singleton: Mapped[int] = mapped_column(Integer, unique=True, nullable=False, default=1)
    pharmacy_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("pharmacy_profile.id"), unique=True, nullable=False
    )
    application_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), unique=True, nullable=False)
    owner_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    deployment_key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )


class MedAppMembership(Base, TimestampMixin):
    __tablename__ = "medapp_memberships"
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), unique=True, nullable=False)
    staff_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("staff.id"), unique=True, nullable=True
    )
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
