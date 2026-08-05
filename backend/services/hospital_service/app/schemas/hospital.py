from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class HospitalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=4000)
    specialty: str | None = Field(default=None, max_length=255)
    insurance_accepted: list[str] = Field(default_factory=list)
    address_line1: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=128)
    country: str | None = Field(default=None, max_length=128)
    latitude: float | None = None
    longitude: float | None = None
    website_url: str | None = Field(default=None, max_length=512)
    contact_phone: str | None = Field(default=None, max_length=64)
    contact_email: str | None = Field(default=None, max_length=255)
    accreditation: str | None = Field(default=None, max_length=255)


class HospitalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    hospital_id: UUID
    name: str
    slug: str
    description: str | None = None
    specialty: str | None = None
    insurance_accepted: list[str]
    address_line1: str | None = None
    city: str | None = None
    country: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    website_url: str | None = None
    contact_phone: str | None = None
    contact_email: str | None = None
    accreditation: str | None = None
    accreditation_status: str
    is_active: bool
    created_at: object
    updated_at: object


class HospitalList(BaseModel):
    items: list[HospitalOut] = Field(default_factory=list)


class HospitalStaffCreate(BaseModel):
    user_id: UUID
    role: str = Field(default="other", max_length=32)
    title: str | None = Field(default=None, max_length=255)
    department: str | None = Field(default=None, max_length=255)


class HospitalStaffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    staff_id: UUID
    hospital_id: UUID
    user_id: UUID
    role: str
    title: str | None = None
    department: str | None = None
    is_active: bool
    created_at: object
    updated_at: object


class HospitalStaffRosterEntry(BaseModel):
    """One row of a hospital's staff roster, as a READER sees it.

    Not `HospitalStaffOut`. That model is the write-echo and always carries
    `user_id`; this one carries it only for callers who administer the hospital
    (see `includes_user_ids` on the envelope). A `user_id` is a stable,
    cross-service handle for a named person, and handing it to every
    authenticated reader alongside their department would let a client
    accumulate an employment graph the roster screen has no use for.

    **There is no name and no photo here, and that is not an oversight** — see
    `HospitalStaffRoster.names_available`.
    """

    model_config = ConfigDict(from_attributes=True)

    staff_id: UUID
    hospital_id: UUID
    role: str
    title: str | None = None
    department: str | None = None
    # Populated only for hospital_admin / platform_admin callers. Null for
    # everyone else means "withheld", not "absent from the record".
    user_id: UUID | None = None


class HospitalStaffRoster(BaseModel):
    """Envelope for `GET /v1/hospitals/{hospital_id}/staff`.

    WHY THE FLAGS ARE IN THE RESPONSE SHAPE
    ---------------------------------------
    hospital_service stores `user_id` for each staff member and nothing else
    about the person: no name, no photo. Names live in user_service, which
    exposes no lookup endpoint, and for the clinicians among the staff a partial
    name could be scraped from doctor_service's public directory. Resolving
    names that way would produce a roster where doctors have names and nurses
    and administrators do not, fanning out one HTTP call per row, on a screen
    that is not worth an availability dependency — and it would quietly turn a
    hospital roster into a bulk personal-data export, which is exactly what Act
    843's purpose-limitation duty is aimed at.

    So the roster ships WITHOUT names, and says so in-band rather than leaving
    the client to infer it from nulls: `names_available` is False and
    `names_unavailable_reason` explains it. A client can then render role, title
    and department honestly (the designed `hospital_detail` frame's rows work
    without a name) instead of showing an EmptyState that wrongly claims no
    directory has been published. When user_service grows a batch name lookup,
    this flag flips to True and clients need no new field.
    """

    items: list[HospitalStaffRosterEntry] = Field(default_factory=list)
    # Deliberately not a bare `list[...]` like reviews: these flags are the
    # contract, and there is nowhere to put them on a bare list.
    names_available: bool = False
    names_unavailable_reason: str | None = None
    includes_user_ids: bool = False


class HospitalReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    review_id: UUID
    hospital_id: UUID
    reviewer_user_id: UUID
    rating: int
    title: str
    body: str | None = None
    is_public: bool
    moderation_status: str
    created_at: object
    updated_at: object