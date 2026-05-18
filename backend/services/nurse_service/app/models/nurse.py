from __future__ import annotations

from uuid import UUID

from sqlalchemy import Boolean, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base, TimestampMixin


class NurseProfile(Base, TimestampMixin):
    __tablename__ = "nurse_profiles"

    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), unique=True, index=True, nullable=False)
    first_name: Mapped[str] = mapped_column(String(255), nullable=False)
    last_name: Mapped[str] = mapped_column(String(255), nullable=False)
    specialty: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    languages: Mapped[list[str]] = mapped_column(JSON, default=list)
    home_visit_fee_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    is_listable: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    @property
    def nurse_id(self):
        return self.id


class NurseServiceArea(Base, TimestampMixin):
    __tablename__ = "nurse_service_areas"

    nurse_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("nurse_profiles.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    service_area_type: Mapped[str] = mapped_column(String(32), nullable=False, default="radius")
    center_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    center_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    radius_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    polygon_geojson: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    @property
    def service_area_id(self):
        return self.id