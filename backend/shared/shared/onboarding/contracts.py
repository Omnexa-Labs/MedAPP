from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ProfessionalActivation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    application_id: UUID
    applicant_id: UUID
    reviewer_id: UUID
    approval_version: int = Field(ge=1)
    role: Literal["doctor", "nurse"]
    first_name: str = Field(min_length=1, max_length=255)
    last_name: str = Field(min_length=1, max_length=255)
    specialty: str | None = Field(default=None, max_length=255)

    @field_validator("first_name", "last_name")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("professional name is required")
        return value.strip()

    @model_validator(mode="after")
    def independent_reviewer(self):
        if self.applicant_id == self.reviewer_id:
            raise ValueError("an applicant cannot approve their own activation")
        return self


class RoleActivation(ProfessionalActivation):
    profile_id: UUID


class ActivationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    application_id: UUID
    applicant_id: UUID
    role: Literal["doctor", "nurse"]
    resource_id: UUID


def activation_authorization(configured: str, supplied: str | None):
    import hmac

    from fastapi import HTTPException

    if len(configured) < 32:
        raise HTTPException(503, "professional activation is not configured")
    if not supplied or not hmac.compare_digest(configured.encode(), supplied.encode()):
        raise HTTPException(401, "invalid activation credential")
