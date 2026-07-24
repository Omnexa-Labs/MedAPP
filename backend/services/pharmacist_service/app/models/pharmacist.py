"""Pharmacist directory model.

A pharmacist is a person — same shape as DoctorProfile / NurseProfile.
The optional `affiliated_pharmacy_id` is a soft reference to
pharmacy_service.PharmacyProfile.id; it's a UUID column with no DB FK
because the two services own separate Postgres databases. Drift (a
pharmacy gets deleted, pharmacist row keeps the orphan UUID) is
accepted; a periodic cleanup is a follow-up if it becomes a problem.

There are NO availability rules on this model. A pharmacist's hours
are the pharmacy's hours — patients shouldn't be booking individual
pharmacists for slots in the same way they book doctors.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import Boolean, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base, TimestampMixin


class PharmacistProfile(Base, TimestampMixin):
    __tablename__ = "pharmacist_profiles"

    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), unique=True, index=True, nullable=False)
    first_name: Mapped[str] = mapped_column(String(255), nullable=False)
    last_name: Mapped[str] = mapped_column(String(255), nullable=False)
    license_number: Mapped[str | None] = mapped_column(String(128), index=True, nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    languages: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    # E.g. ["clinical", "compounding", "geriatric"]. Surfaced as badges
    # on the mobile card. Not normalized into a separate table because
    # the set is small and evolves slowly.
    specialties: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    photo_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    # Soft FK to pharmacy_service.PharmacyProfile.id. Nullable because
    # not every listed pharmacist is currently affiliated with a
    # listable pharmacy (locum, retired-but-consulting, etc.).
    affiliated_pharmacy_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True, nullable=True)
    is_listable: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    @property
    def pharmacist_id(self):
        return self.id
