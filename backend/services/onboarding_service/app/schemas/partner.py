from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class PartnerType(StrEnum):
    HOSPITAL = "hospital"
    PRACTITIONER = "practitioner"
    PHARMACY = "pharmacy"


class OnboardingMode(StrEnum):
    FACILITY = "facility"
    TEAM = "team"


class ApplicationStatus(StrEnum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUSPENDED = "suspended"


class ReviewAction(StrEnum):
    UNDER_REVIEW = "under_review"
    APPROVE = "approve"
    REJECT = "reject"


class ApplicationDocumentCreate(BaseModel):
    kind: str = Field(min_length=1, max_length=64)
    url: str = Field(min_length=1, max_length=1024)
    label: str | None = Field(default=None, max_length=255)
    model_config = ConfigDict(extra="forbid")
    verified: Literal[False] = False


class ApplicationDocumentOut(BaseModel):
    kind: str
    url: str
    label: str | None = None
    verified: bool = False
    content_type: str | None = None
    size_bytes: int | None = None
    sha256: str | None = None
    verified_by_user_id: UUID | None = None
    verified_at: datetime | None = None
    document_id: UUID
    uploaded_by_user_id: UUID
    uploaded_at: datetime


class TeamMemberCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    full_name: str = Field(min_length=1, max_length=255)
    user_id: UUID | None = None
    role: str = Field(min_length=1, max_length=64)
    title: str | None = Field(default=None, max_length=255)
    specialty: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=64)
    is_primary: bool = False

    @field_validator("full_name", "role")
    @classmethod
    def nonblank_name_and_role(cls, value):
        if not value.strip():
            raise ValueError("team member name and role are required")
        return value.strip()


class TeamMemberOut(TeamMemberCreate):
    member_id: UUID
    added_by_user_id: UUID
    added_at: datetime


class PartnerApplicationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    practitioner_role: Literal["doctor", "nurse"] | None = None
    professional_first_name: str | None = Field(default=None, max_length=255)
    professional_last_name: str | None = Field(default=None, max_length=255)
    partner_type: PartnerType
    onboarding_mode: OnboardingMode | None = None
    legal_name: str = Field(min_length=1, max_length=255)
    display_name: str | None = Field(default=None, max_length=255)
    specialty: str | None = Field(default=None, max_length=255)
    license_number: str | None = Field(default=None, max_length=255)
    registration_number: str | None = Field(default=None, max_length=255)
    tax_id: str | None = Field(default=None, max_length=255)
    country: str | None = Field(default=None, max_length=128)
    city: str | None = Field(default=None, max_length=128)
    address_line1: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=64)
    website_url: str | None = Field(default=None, max_length=512)
    notes: str | None = Field(default=None, max_length=10000)
    documents: list[ApplicationDocumentCreate] = Field(default_factory=list, max_length=0)
    team_members: list[TeamMemberCreate] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def _validate_onboarding_mode(self):
        if self.partner_type == PartnerType.HOSPITAL and self.onboarding_mode is None:
            raise ValueError("hospital onboarding requires onboarding_mode")
        if self.partner_type != PartnerType.HOSPITAL and self.onboarding_mode is not None:
            raise ValueError("only hospital partners can use onboarding_mode")
        if self.partner_type != PartnerType.PRACTITIONER and any(
            value is not None
            for value in (
                self.practitioner_role,
                self.professional_first_name,
                self.professional_last_name,
            )
        ):
            raise ValueError("professional identity applies only to practitioner applications")
        return self


class PartnerApplicationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    practitioner_role: Literal["doctor", "nurse"] | None = None
    professional_first_name: str | None = Field(default=None, max_length=255)
    professional_last_name: str | None = Field(default=None, max_length=255)
    legal_name: str | None = Field(default=None, min_length=1, max_length=255)
    display_name: str | None = Field(default=None, min_length=1, max_length=255)
    specialty: str | None = Field(default=None, max_length=255)
    license_number: str | None = Field(default=None, max_length=255)
    registration_number: str | None = Field(default=None, max_length=255)
    tax_id: str | None = Field(default=None, max_length=255)
    country: str | None = Field(default=None, max_length=128)
    city: str | None = Field(default=None, max_length=128)
    address_line1: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=64)
    website_url: str | None = Field(default=None, max_length=512)
    notes: str | None = Field(default=None, max_length=10000)

    @field_validator("legal_name", "display_name", mode="before")
    @classmethod
    def name_when_present(cls, value):
        if value is None or not str(value).strip():
            raise ValueError("name cannot be empty")
        return value.strip()


class ApplicationSubmitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    attestation_accepted: Literal[True]
    attestation_version: Literal["professional-application-v1"]

    @field_validator("attestation_accepted", mode="before")
    @classmethod
    def explicit_attestation(cls, value):
        if value is not True:
            raise ValueError("explicit acceptance of the attestation is required")
        return value


class ApplicationEventOut(BaseModel):
    event_id: UUID
    actor_id: UUID
    action: str
    application_version: int
    created_at: datetime
    details: dict[str, object]


class ApplicationStatusUpdateRequest(BaseModel):
    status: ApplicationStatus


class ApplicationReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    verified_document_ids: list[UUID] = Field(default_factory=list, max_length=20)
    action: ReviewAction
    rejection_reason: str | None = Field(default=None, max_length=2000)


class ApplicationActivationOut(BaseModel):
    state: Literal[
        "not_started", "pending", "retry", "attention_required", "setup_required", "active"
    ]
    attempts: int = Field(ge=0)
    reason: str | None = None
    profile_id: UUID | None = None
    activated_at: datetime | None = None


class PartnerApplicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    application_id: UUID
    version: int
    practitioner_role: str | None = None
    professional_first_name: str | None = None
    professional_last_name: str | None = None
    attested_at: datetime | None = None
    attestation_version: str | None = None
    partner_type: str
    onboarding_mode: str | None = None
    legal_name: str
    display_name: str
    specialty: str | None = None
    license_number: str | None = None
    registration_number: str | None = None
    tax_id: str | None = None
    country: str | None = None
    city: str | None = None
    address_line1: str | None = None
    email: str | None = None
    phone: str | None = None
    website_url: str | None = None
    status: str
    submitted_by_user_id: UUID
    submitted_at: datetime | None = None
    reviewed_by_user_id: UUID | None = None
    reviewed_at: datetime | None = None
    rejection_reason: str | None = None
    notes: str | None = None
    documents: list[ApplicationDocumentOut] = Field(default_factory=list)
    team_members: list[TeamMemberOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class PartnerApplicationList(BaseModel):
    items: list[PartnerApplicationOut] = Field(default_factory=list)


class PartnerApplicationSummaryOut(BaseModel):
    total_count: int = 0
    draft_count: int = 0
    submitted_count: int = 0
    under_review_count: int = 0
    approved_count: int = 0
    rejected_count: int = 0
    recent_applications: list[PartnerApplicationOut] = Field(default_factory=list)
