"""Owner-managed pharmacy drafts and patient-directory publication."""

import re
from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    StringConstraints,
    TypeAdapter,
    field_validator,
    model_validator,
)

InsuranceName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]
website_adapter = TypeAdapter(HttpUrl)


class DirectoryFields(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    insurance_accepted: list[InsuranceName] | None = Field(default=None, max_length=50)
    address_line1: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=128)
    country: str | None = Field(default=None, max_length=128)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    website_url: str | None = Field(default=None, max_length=512)
    services_offered: list[InsuranceName] | None = Field(default=None, max_length=30)
    operating_hours: dict[str, str] | None = None
    photo_url: str | None = Field(default=None, max_length=1024)
    head_pharmacist_name: str | None = Field(default=None, max_length=255)
    head_pharmacist_bio: str | None = Field(default=None, max_length=1000)
    phone: str | None = Field(default=None, max_length=64)
    email: str | None = Field(default=None, max_length=255)

    @field_validator(
        "photo_url",
        "head_pharmacist_name",
        "head_pharmacist_bio",
        "description",
        "address_line1",
        "city",
        "country",
        "website_url",
        "phone",
        "email",
        mode="before",
    )
    @classmethod
    def optional_text(cls, value):
        return value.strip() or None if isinstance(value, str) else value

    @field_validator("insurance_accepted", "services_offered")
    @classmethod
    def distinct_insurance(cls, value):
        if value is None:
            return None
        seen = set()
        result = []
        for name in value:
            if name.casefold() not in seen:
                result.append(name)
                seen.add(name.casefold())
        return result


class DirectorySnapshot(DirectoryFields):
    """A stored snapshot, including older values an administrator may need to correct."""

    name: str = Field(min_length=1, max_length=255)
    insurance_accepted: list[InsuranceName] = Field(default_factory=list, max_length=50)
    services_offered: list[InsuranceName] = Field(default_factory=list, max_length=30)


class DirectoryData(DirectorySnapshot):
    @field_validator("photo_url")
    @classmethod
    def photo(cls, value):
        if value is None:
            return None
        from ..photo_paths import PHOTO_PATH

        if PHOTO_PATH.fullmatch(value):
            return value
        parsed = website_adapter.validate_python(value)
        if parsed.scheme != "https" or parsed.username or parsed.password:
            raise ValueError("Use an HTTPS photo address without credentials.")
        return str(parsed)

    @field_validator("operating_hours")
    @classmethod
    def hours(cls, value):
        if value is None:
            return None
        days = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
        if any(day not in days for day in value):
            raise ValueError("Use the seven named weekdays for operating hours.")
        result = {}
        for day in days:
            if day not in value:
                continue
            hours = value[day].strip().lower()
            if hours not in {"closed", "24 hours"}:
                if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d-(?:[01]\d|2[0-3]):[0-5]\d", hours):
                    raise ValueError("Hours must be HH:MM-HH:MM, closed, or 24 hours.")
                if hours[:5] == hours[6:]:
                    raise ValueError("Use 24 hours for all-day opening.")
            result[day] = hours
        return result

    @field_validator("website_url")
    @classmethod
    def website(cls, value):
        if value is None:
            return None
        parsed = website_adapter.validate_python(value)
        if parsed.username or parsed.password:
            raise ValueError("Website addresses cannot contain credentials.")
        return str(parsed)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value):
        if value is not None and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Enter a valid contact email address.")
        return value

    @model_validator(mode="after")
    def coordinate_pair(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Provide both latitude and longitude, or clear both.")
        return self


class DirectoryChanges(DirectoryFields):
    @model_validator(mode="after")
    def changed_fields(self):
        if not self.model_fields_set:
            raise ValueError("Provide at least one changed field.")
        for name in ("name", "insurance_accepted", "services_offered"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null.")
        return self


class DirectoryEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = Field(ge=1)
    changes: DirectoryChanges


class DirectoryAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = Field(ge=1)


class DirectoryActor(BaseModel):
    model_config = ConfigDict(extra="forbid")
    actor_id: UUID
    owner_user_id: UUID


class InternalDirectoryEdit(DirectoryEdit, DirectoryActor):
    pass


class InternalDirectoryAction(DirectoryAction, DirectoryActor):
    pass


class DirectoryIssue(BaseModel):
    field: str
    message: str


class DirectoryView(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pharmacy_id: UUID
    version: int
    draft: DirectorySnapshot
    published: DirectorySnapshot | None
    is_listed: bool
    has_unpublished_changes: bool
    last_published_at: datetime | None
    publication_issues: list[DirectoryIssue]
    license_number: str | None
    license_categories: list[str]


class DirectoryEventOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    actor_id: UUID
    version: int
    action: str
    created_at: datetime
    changed_fields: list[str]
    before: dict
    after: dict


class DirectoryHistory(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[DirectoryEventOut]
    has_more: bool
