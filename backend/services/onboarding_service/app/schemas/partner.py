from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


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
    verified: bool = False


class ApplicationDocumentOut(ApplicationDocumentCreate):
    document_id: UUID
    uploaded_by_user_id: UUID
    uploaded_at: datetime


class TeamMemberCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    user_id: UUID | None = None
    role: str = Field(min_length=1, max_length=64)
    title: str | None = Field(default=None, max_length=255)
    specialty: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=64)
    is_primary: bool = False


class TeamMemberOut(TeamMemberCreate):
    member_id: UUID
    added_by_user_id: UUID
    added_at: datetime


class PartnerApplicationCreate(BaseModel):
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
    notes: str | None = None
    documents: list[ApplicationDocumentCreate] = Field(default_factory=list)
    team_members: list[TeamMemberCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate_onboarding_mode(self):
        if self.partner_type == PartnerType.HOSPITAL and self.onboarding_mode is None:
            raise ValueError("hospital onboarding requires onboarding_mode")
        if self.partner_type != PartnerType.HOSPITAL and self.onboarding_mode is not None:
            raise ValueError("only hospital partners can use onboarding_mode")
        return self


class ApplicationStatusUpdateRequest(BaseModel):
    status: ApplicationStatus


class ApplicationReviewRequest(BaseModel):
    action: ReviewAction
    rejection_reason: str | None = Field(default=None, max_length=2000)


class PartnerApplicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    application_id: UUID
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