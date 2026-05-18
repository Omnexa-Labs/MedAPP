from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class NurseBase(BaseModel):
    first_name: str = Field(min_length=1, max_length=255)
    last_name: str = Field(min_length=1, max_length=255)
    specialty: str | None = Field(default=None, max_length=255)
    bio: str | None = None
    languages: list[str] = Field(default_factory=list)
    home_visit_fee_cents: int | None = Field(default=None, ge=0)
    photo_url: str | None = Field(default=None, max_length=1024)
    is_listable: bool = False


class NurseCreate(NurseBase):
    pass


class NurseUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=255)
    last_name: str | None = Field(default=None, min_length=1, max_length=255)
    specialty: str | None = Field(default=None, max_length=255)
    bio: str | None = None
    languages: list[str] | None = None
    home_visit_fee_cents: int | None = Field(default=None, ge=0)
    photo_url: str | None = Field(default=None, max_length=1024)
    is_listable: bool | None = None


class NurseOut(NurseBase):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    nurse_id: UUID
    user_id: UUID
    is_active: bool


class NurseList(BaseModel):
    items: list[NurseOut] = Field(default_factory=list)


class NurseServiceAreaPayload(BaseModel):
    service_area_type: str = Field(default="radius", max_length=32)
    center_latitude: float | None = None
    center_longitude: float | None = None
    radius_km: float | None = Field(default=None, ge=0)
    polygon_geojson: dict[str, object] | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def _require_area_reference(self):
        if self.service_area_type == "radius":
            if self.center_latitude is None or self.center_longitude is None or self.radius_km is None:
                raise ValueError("radius service area requires center coordinates and radius_km")
        elif self.service_area_type == "polygon":
            if self.polygon_geojson is None:
                raise ValueError("polygon service area requires polygon_geojson")
        return self


class NurseServiceAreaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    service_area_id: UUID
    nurse_id: UUID
    service_area_type: str
    center_latitude: float | None = None
    center_longitude: float | None = None
    radius_km: float | None = None
    polygon_geojson: dict[str, object] | None = None
    notes: str | None = None
    is_active: bool
    created_at: object
    updated_at: object