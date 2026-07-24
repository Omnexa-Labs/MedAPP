from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PharmacistBase(BaseModel):
    first_name: str = Field(min_length=1, max_length=255)
    last_name: str = Field(min_length=1, max_length=255)
    license_number: str | None = Field(default=None, max_length=128)
    bio: str | None = None
    languages: list[str] = Field(default_factory=list)
    specialties: list[str] = Field(default_factory=list)
    photo_url: str | None = Field(default=None, max_length=1024)
    affiliated_pharmacy_id: UUID | None = None
    is_listable: bool = False


class PharmacistCreate(PharmacistBase):
    pass


class PharmacistUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=255)
    last_name: str | None = Field(default=None, min_length=1, max_length=255)
    license_number: str | None = Field(default=None, max_length=128)
    bio: str | None = None
    languages: list[str] | None = None
    specialties: list[str] | None = None
    photo_url: str | None = Field(default=None, max_length=1024)
    affiliated_pharmacy_id: UUID | None = None
    is_listable: bool | None = None


class PharmacistOut(PharmacistBase):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    pharmacist_id: UUID
    user_id: UUID
    is_active: bool


class PharmacistList(BaseModel):
    items: list[PharmacistOut] = Field(default_factory=list)
    total: int = 0
    limit: int = 50
    offset: int = 0
