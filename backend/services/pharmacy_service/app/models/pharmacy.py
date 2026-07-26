"""Pharmacy directory model.

This service is the patient-facing read directory for pharmacies, NOT the
operational system. The operational counterpart per-pharmacy is
`pms_service` (single-tenant). The link between the two is the optional
`pms_base_url` column — when present, this service can call upstream
pms_service for stock visibility on demand.

License categories and operating hours are stored as JSON / ARRAY so
they're cheap to evolve without an Alembic migration each time the
domain learns a new field. If license_categories grows query-able
("only pharmacies licensed for controlled substances"), revisit and
denormalize then.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import Boolean, Float, JSON, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base, TimestampMixin


class PharmacyProfile(Base, TimestampMixin):
    __tablename__ = "pharmacy_profiles"

    # Owner / operator's user_id in user_service. Not a DB FK because
    # cross-service Postgres; we treat it as a soft reference.
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), unique=True, index=True, nullable=False)

    # Display + URL identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Licensure
    license_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # license_categories on Postgres becomes a text[] column. On SQLite
    # (tests) ARRAY isn't supported natively; the test conftest installs
    # a JSON fallback dialect compile hook (mirrors doctor_service).
    license_categories: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)

    # Location
    address_line1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(128), index=True, nullable=True)
    country: Mapped[str | None] = mapped_column(String(128), index=True, nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Contact
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    website_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Service attributes
    insurance_accepted: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    # Shape: {"monday": "08:00-22:00", "tuesday": "...", ..., "sunday": "closed"}.
    # JSON rather than seven String columns so future schemas (multiple
    # ranges per day, holiday overrides) don't need migrations.
    operating_hours: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    photo_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    # Stock-visibility integration with pms_service. Both nullable —
    # pharmacies without a pms deployment just don't get the stock badge.
    pms_base_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # NOT the secret itself — an opaque reference (a key name in a
    # secret store, an env var name, etc.). For the dev stack we resolve
    # via settings.medapp_partner_secret regardless of this value, but
    # the column shape is ready for per-pharmacy secrets in production.
    pms_partner_secret_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Listing controls
    is_listable: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    @property
    def pharmacy_id(self):
        return self.id
