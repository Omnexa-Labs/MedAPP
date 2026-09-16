from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .tenant import HmsRole


class InvitationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    email: str = Field(min_length=3, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    hms_role: HmsRole
    # Reuse the staff contract; the authenticated recipient supplies user_id.
    employee_id: str | None = Field(default=None, max_length=32)
    title: str | None = Field(default=None, max_length=64)
    specialty: str | None = Field(default=None, max_length=128)
    qualification: str | None = Field(default=None, max_length=255)
    department_id: UUID | None = None

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return value.lower()


class InvitationCode(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    code: str = Field(min_length=43, max_length=43, pattern=r"^[A-Za-z0-9_-]+$")


class MembershipChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = Field(ge=1)
    hms_role: HmsRole
    is_active: bool
