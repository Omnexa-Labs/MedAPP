from __future__ import annotations

from enum import StrEnum
from uuid import UUID

from sqlalchemy import Boolean, DateTime, JSON, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base, TimestampMixin


class HmsRoleEnum(StrEnum):
    HOSPITAL_ADMIN = "hospital_admin"
    DEPARTMENT_HEAD = "department_head"
    DOCTOR = "doctor"
    NURSE = "nurse"
    PHARMACIST = "pharmacist"
    BILLING_CLERK = "billing_clerk"
    RECEPTIONIST = "receptionist"
    LAB_TECH = "lab_tech"


class TenantRegistry(Base, TimestampMixin):
    __tablename__ = "tenant_registry"

    hospital_name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    database_url: Mapped[str] = mapped_column(String(512), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    provisioned_at: Mapped[DateTime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    config_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    @property
    def tenant_id(self) -> UUID:
        return self.id


class HmsStaffRole(Base, TimestampMixin):
    __tablename__ = "hms_staff_roles"
    __table_args__ = (
        UniqueConstraint("tenant_id", "user_id", name="uq_hms_staff_roles_tenant_user"),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, index=True
    )
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    hms_role: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    department_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
