from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


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
    first_name: str | None = Field(default=None, min_length=1)
    last_name: str | None = Field(default=None, min_length=1)
    specialty: str | None = None
    bio: str | None = None
    languages: list[str] | None = None
    consultation_fee_cents: int | None = Field(default=None, ge=0)
    photo_url: str | None = None
    is_listable: bool | None = None


class DoctorProfileOut(DoctorBase):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    doctor_id: UUID
    user_id: UUID
    is_active: bool


class DoctorList(BaseModel):
    items: list[DoctorProfileOut] = Field(default_factory=list)