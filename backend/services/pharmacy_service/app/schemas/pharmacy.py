from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PharmacyBase(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=128)
    description: str | None = None
    license_number: str | None = Field(default=None, max_length=255)
    license_categories: list[str] = Field(default_factory=list)
    address_line1: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=128)
    country: str | None = Field(default=None, max_length=128)
    latitude: float | None = None
    longitude: float | None = None
    phone: str | None = Field(default=None, max_length=64)
    email: str | None = Field(default=None, max_length=255)
    website_url: str | None = Field(default=None, max_length=512)
    insurance_accepted: list[str] = Field(default_factory=list)
    # operating_hours intentionally typed as dict[str, str] for the
    # common "{weekday: 'HH:MM-HH:MM' | 'closed'}" shape. Pydantic will
    # accept any string dict; schema is not enforced beyond that today.
    operating_hours: dict[str, str] | None = None
    photo_url: str | None = Field(default=None, max_length=1024)
    is_listable: bool = False


class PharmacyCreate(PharmacyBase):
    pass


class PharmacyUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = None
    license_number: str | None = Field(default=None, max_length=255)
    license_categories: list[str] | None = None
    address_line1: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=128)
    country: str | None = Field(default=None, max_length=128)
    latitude: float | None = None
    longitude: float | None = None
    phone: str | None = Field(default=None, max_length=64)
    email: str | None = Field(default=None, max_length=255)
    website_url: str | None = Field(default=None, max_length=512)
    insurance_accepted: list[str] | None = None
    operating_hours: dict[str, str] | None = None
    photo_url: str | None = Field(default=None, max_length=1024)
    is_listable: bool | None = None


class PharmacyOut(PharmacyBase):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    pharmacy_id: UUID
    is_active: bool
    services_offered: list[str] = Field(default_factory=list)
    head_pharmacist_name: str | None = None
    head_pharmacist_bio: str | None = None

    @field_validator("photo_url")
    @classmethod
    def public_photo_url(cls, value):
        from ..config import settings
        from ..photo_paths import PHOTO_PATH

        if value and PHOTO_PATH.fullmatch(value):
            return settings.public_api_origin + value
        return value


class PharmacyList(BaseModel):
    """Pharmacy list envelope.

    Mirrors hms_service's patient list contract — items + total + the
    pagination cursor the client sent — so a paginated UI can render
    "N of M results" without a separate count call.
    """

    items: list[PharmacyOut] = Field(default_factory=list)
    total: int = 0
    limit: int = 50
    offset: int = 0


class PharmacyStockBadgeOut(BaseModel):
    """Per-pharmacy stock answer for a single drug.

    `pharmacy_id` echoes the pharmacy, `drug_name` echoes the query so
    the client can disambiguate concurrent requests. `quantity` is the
    flattened on-hand count across all batches; `available` is the
    boolean the UI actually paints. When the upstream pms_service is
    unreachable or has no record, returns `available=False, source="unknown"`
    rather than 5xx — the directory must not be brittle to one pharmacy.
    """

    pharmacy_id: UUID
    drug_name: str
    available: bool
    quantity: int | None = None
    price_cents: int | None = None
    currency: str | None = None
    source: str = "pms"
