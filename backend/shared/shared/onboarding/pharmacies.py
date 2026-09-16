"""Approved pharmacy identity and its separately configured PMS deployment."""

from typing import Literal
from uuid import NAMESPACE_URL, UUID, uuid5

from pydantic import BaseModel, ConfigDict, Field, model_validator


def pharmacy_resource_id(application_id: UUID) -> UUID:
    return uuid5(NAMESPACE_URL, f"medapp:pharmacy-application:{application_id}")


class PharmacyActivation(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    application_id: UUID
    applicant_id: UUID
    reviewer_id: UUID
    approval_version: int = Field(ge=1)
    role: Literal["pharmacy"] = "pharmacy"
    name: str = Field(min_length=1, max_length=255)
    license_number: str = Field(min_length=1, max_length=255)
    address_line1: str = Field(min_length=1, max_length=255)
    city: str = Field(min_length=1, max_length=128)
    country: str = Field(min_length=1, max_length=128)
    contact_email: str = Field(min_length=1, max_length=255)
    contact_phone: str = Field(min_length=1, max_length=64)
    website_url: str | None = Field(default=None, max_length=512)

    @model_validator(mode="after")
    def independent_reviewer(self):
        if self.applicant_id == self.reviewer_id:
            raise ValueError("an applicant cannot approve their own activation")
        return self


class PharmacyWorkspaceActivation(PharmacyActivation):
    pharmacy_id: UUID
    deployment_key: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9_-]*$")

    @model_validator(mode="after")
    def approved_identity(self):
        if self.pharmacy_id != pharmacy_resource_id(self.application_id):
            raise ValueError("workspace identity must match the approved pharmacy")
        return self


class PharmacyActivationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    application_id: UUID
    applicant_id: UUID
    role: Literal["pharmacy"] = "pharmacy"
    resource_id: UUID


class PharmacyWorkspaceResult(PharmacyActivationResult):
    deployment_key: str


class PharmacyWorkspaceRequest(PharmacyActivation):
    """The approval worker asks the directory to use its operator-owned routing."""

    pass
