from uuid import UUID

from pydantic import field_validator, BaseModel, ConfigDict, Field


class DoctorBase(BaseModel):
    first_name: str = Field(..., min_length=1)
    last_name: str = Field(..., min_length=1)
    specialty: str | None = None
    bio: str | None = None
    languages: list[str] = Field(default_factory=list)
    consultation_fee_cents: int | None = Field(default=None, ge=0)
    photo_url: str | None = None
    is_listable: bool = False


class DoctorCreate(DoctorBase):
    pass


class DoctorUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @field_validator("first_name", "last_name", "languages", "is_listable", mode="before")
    @classmethod
    def required_when_present(cls, value, info):
        if value is None:
            raise ValueError(f"{info.field_name} cannot be null")
        if info.field_name in {"first_name", "last_name"} and isinstance(value, str):
            value = value.strip()
        return value

    @field_validator("languages")
    @classmethod
    def language_labels(cls, values):
        if len(values) > 20 or any(not value.strip() or len(value.strip()) > 120 for value in values):
            raise ValueError("provide up to 20 non-empty language names of at most 120 characters")
        return list(dict.fromkeys(value.strip() for value in values))

    first_name: str | None = Field(default=None, min_length=1, max_length=255)
    last_name: str | None = Field(default=None, min_length=1, max_length=255)
    specialty: str | None = Field(default=None, max_length=255)
    bio: str | None = Field(default=None, max_length=10000)
    languages: list[str] | None = None
    consultation_fee_cents: int | None = Field(default=None, ge=0)
    photo_url: str | None = Field(default=None, max_length=1024)
    is_listable: bool | None = None


class DoctorProfileOut(DoctorBase):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    doctor_id: UUID
    user_id: UUID
    is_active: bool


class DoctorList(BaseModel):
    items: list[DoctorProfileOut] = Field(default_factory=list)