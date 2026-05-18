from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Integer, JSON, String, Text, Time
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base, TimestampMixin


class DoctorProfile(Base, TimestampMixin):
    __tablename__ = "doctor_profiles"

    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), unique=True, index=True, nullable=False)
    first_name: Mapped[str] = mapped_column(String(255), nullable=False)
    last_name: Mapped[str] = mapped_column(String(255), nullable=False)
    specialty: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    languages: Mapped[list[str]] = mapped_column(JSON, default=list)
    consultation_fee_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    is_listable: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    @property
    def doctor_id(self):
        return self.id


class DoctorAvailabilityRule(Base, TimestampMixin):
    __tablename__ = "doctor_availability_rules"

    doctor_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("doctor_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    start_time: Mapped[str] = mapped_column(Time, nullable=False)
    end_time: Mapped[str] = mapped_column(Time, nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)