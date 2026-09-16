from __future__ import annotations

from enum import StrEnum
from typing import ClassVar
from uuid import UUID

from shared.db import Base, TimestampMixin
from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column


class PartnerType(StrEnum):
    HOSPITAL = "hospital"
    PRACTITIONER = "practitioner"
    PHARMACY = "pharmacy"


class OnboardingMode(StrEnum):
    FACILITY = "facility"
    TEAM = "team"


class PartnerApplicationStatus(StrEnum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUSPENDED = "suspended"


class PartnerApplication(Base, TimestampMixin):
    __tablename__ = "partner_applications"

    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    practitioner_role: Mapped[str | None] = mapped_column(String(16), nullable=True)
    professional_first_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    professional_last_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    attested_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attestation_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    __mapper_args__: ClassVar[dict[str, object]] = {"version_id_col": version}

    partner_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    onboarding_mode: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    legal_name: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    specialty: Mapped[str | None] = mapped_column(String(255), nullable=True)
    license_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    registration_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tax_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    country: Mapped[str | None] = mapped_column(String(128), nullable=True)
    city: Mapped[str | None] = mapped_column(String(128), nullable=True)
    address_line1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    website_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    submitted_by_user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=PartnerApplicationStatus.DRAFT, index=True
    )
    documents_json: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    team_members_json: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    submitted_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by_user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True, index=True
    )
    reviewed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    @property
    def application_id(self):
        return self.id

    @property
    def documents(self):
        return [
            {**doc, "verified": bool(doc.get("verified") and doc.get("verified_by_user_id"))}
            for doc in self.documents_json
        ]

    @property
    def team_members(self):
        return self.team_members_json


class ApplicationEvent(Base, TimestampMixin):
    __tablename__ = "application_events"
    application_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("partner_applications.id"), nullable=False, index=True
    )
    actor_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    application_version: Mapped[int] = mapped_column(Integer, nullable=False)
    details: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
