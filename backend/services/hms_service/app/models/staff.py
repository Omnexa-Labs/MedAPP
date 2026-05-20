from __future__ import annotations

from uuid import UUID

from sqlalchemy import Boolean, Date, Integer, String, Time
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base, TimestampMixin


class StaffMember(Base, TimestampMixin):
    __tablename__ = "staff_members"

    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, unique=True, index=True)
    employee_id: Mapped[str | None] = mapped_column(String(32), nullable=True, unique=True, index=True)
    first_name: Mapped[str] = mapped_column(String(128), nullable=False)
    last_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(String(64), nullable=True)
    specialty: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    qualification: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)

    @property
    def staff_id(self) -> UUID:
        return self.id


class StaffSchedule(Base, TimestampMixin):
    __tablename__ = "staff_schedules"

    staff_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[str] = mapped_column(String(8), nullable=False)
    end_time: Mapped[str] = mapped_column(String(8), nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    effective_from: Mapped[str] = mapped_column(Date, nullable=False)
    effective_until: Mapped[str | None] = mapped_column(Date, nullable=True)
