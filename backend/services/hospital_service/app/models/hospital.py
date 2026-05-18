from __future__ import annotations

from enum import StrEnum
from uuid import UUID

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base, TimestampMixin


class StaffRole(StrEnum):
    DOCTOR = "doctor"
    NURSE = "nurse"
    ADMIN = "admin"
    OTHER = "other"


class HospitalProfile(Base, TimestampMixin):
    __tablename__ = "hospital_profiles"

    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    slug: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    specialty: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    insurance_accepted: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    address_line1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    country: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    website_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    accreditation: Mapped[str | None] = mapped_column(String(255), nullable=True)
    accreditation_status: Mapped[str] = mapped_column(String(64), nullable=False, default="pending", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)

    @property
    def hospital_id(self):
        return self.id


class HospitalStaff(Base, TimestampMixin):
    __tablename__ = "hospital_staff"

    hospital_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("hospital_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default=StaffRole.OTHER, index=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)


class HospitalReview(Base, TimestampMixin):
    __tablename__ = "hospital_reviews"

    hospital_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("hospital_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    moderation_status: Mapped[str] = mapped_column(String(32), nullable=False, default="approved", index=True)