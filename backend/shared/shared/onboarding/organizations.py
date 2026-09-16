"""Frozen hospital approval commands; no deployment URLs or role choices from applicants."""

from typing import Literal
from uuid import NAMESPACE_URL, UUID, uuid5

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def hospital_resource_id(application_id: UUID) -> UUID:
    return uuid5(NAMESPACE_URL, f"medapp:hospital-application:{application_id}")


class HospitalActivation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    application_id: UUID
    applicant_id: UUID
    reviewer_id: UUID
    approval_version: int = Field(ge=1)
    role: Literal["hospital"] = "hospital"
    name: str = Field(min_length=1, max_length=255)
    specialty: str | None = Field(default=None, max_length=255)
    address_line1: str = Field(min_length=1, max_length=255)
    city: str = Field(min_length=1, max_length=128)
    country: str = Field(min_length=1, max_length=128)
    contact_email: str = Field(min_length=1, max_length=255)
    contact_phone: str = Field(min_length=1, max_length=64)
    website_url: str | None = Field(default=None, max_length=512)

    @field_validator("name", "address_line1", "city", "country", "contact_email", "contact_phone")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("approved organization details are required")
        return value.strip()

    @model_validator(mode="after")
    def independent_reviewer(self):
        if self.applicant_id == self.reviewer_id:
            raise ValueError("an applicant cannot approve their own activation")
        return self


class HospitalWorkspaceActivation(HospitalActivation):
    hospital_id: UUID

    @model_validator(mode="after")
    def approved_hospital_identity(self):
        if self.hospital_id != hospital_resource_id(self.application_id):
            raise ValueError("workspace identity must match the approved organization")
        return self


class HospitalActivationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    application_id: UUID
    applicant_id: UUID
    role: Literal["hospital"] = "hospital"
    resource_id: UUID


class ActivationSubject(BaseModel):
    model_config = ConfigDict(extra="forbid")
    applicant_id: UUID
    is_active: Literal[True]
