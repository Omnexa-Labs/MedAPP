from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class HospitalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=4000)
    specialty: str | None = Field(default=None, max_length=255)
    insurance_accepted: list[str] = Field(default_factory=list)
    address_line1: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=128)
    country: str | None = Field(default=None, max_length=128)
    latitude: float | None = None
    longitude: float | None = None
    website_url: str | None = Field(default=None, max_length=512)
    contact_phone: str | None = Field(default=None, max_length=64)
    contact_email: str | None = Field(default=None, max_length=255)
    accreditation: str | None = Field(default=None, max_length=255)


class HospitalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    hospital_id: UUID
    name: str
    slug: str
    description: str | None = None
    specialty: str | None = None
    insurance_accepted: list[str]
    address_line1: str | None = None
    city: str | None = None
    country: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    website_url: str | None = None
    contact_phone: str | None = None
    contact_email: str | None = None
    accreditation: str | None = None
    accreditation_status: str
    is_active: bool
    created_at: object
    updated_at: object


class HospitalList(BaseModel):
    items: list[HospitalOut] = Field(default_factory=list)


class HospitalStaffCreate(BaseModel):
    user_id: UUID
    role: str = Field(default="other", max_length=32)
    title: str | None = Field(default=None, max_length=255)
    department: str | None = Field(default=None, max_length=255)


class HospitalStaffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    staff_id: UUID
    hospital_id: UUID
    user_id: UUID
    role: str
    title: str | None = None
    department: str | None = None
    is_active: bool
    created_at: object
    updated_at: object


class HospitalReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    review_id: UUID
    hospital_id: UUID
    reviewer_user_id: UUID
    rating: int
    title: str
    body: str | None = None
    is_public: bool
    moderation_status: str
    created_at: object
    updated_at: object