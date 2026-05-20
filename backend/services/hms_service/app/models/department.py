from __future__ import annotations

from uuid import UUID

from sqlalchemy import Boolean, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base, TimestampMixin


class Department(Base, TimestampMixin):
    __tablename__ = "departments"

    name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    slug: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    head_staff_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)

    @property
    def department_id(self) -> UUID:
        return self.id


class DepartmentMembership(Base, TimestampMixin):
    __tablename__ = "department_memberships"
    __table_args__ = (
        UniqueConstraint("staff_id", "department_id", name="uq_dept_membership_staff_dept"),
    )

    staff_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    department_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    role_in_department: Mapped[str] = mapped_column(String(64), nullable=False, default="member")
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
