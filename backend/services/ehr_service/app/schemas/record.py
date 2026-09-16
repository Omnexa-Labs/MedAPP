from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, computed_field


class PatientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    patient_id: UUID
    user_id: UUID
    display_name: str | None = None


class VitalCreate(BaseModel):
    kind: str = Field(min_length=1, max_length=64)
    value: str = Field(min_length=1, max_length=128)
    unit: str | None = Field(default=None, max_length=32)
    recorded_at: datetime
    note: str | None = None


class VitalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    vital_id: UUID
    patient_id: UUID
    recorded_by_user_id: UUID
    kind: str
    value: str
    unit: str | None = None
    recorded_at: datetime
    note: str | None = None


class VitalTimelineOut(BaseModel):
    items: list[VitalOut] = Field(default_factory=list)
    next_cursor: str | None = None


class PatientSummaryOut(BaseModel):
    patient: PatientOut
    latest_vitals: list[VitalOut] = Field(default_factory=list)
    active_consents: list[ConsentOut] = Field(default_factory=list)


class ConsentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    doctor_user_id: UUID
    scope: Literal["records", "records_and_vitals"] = "records"
    expires_in_days: Literal[7, 30, 90] = 30
    reason: str = Field(default="patient consent", max_length=255)


class ConsentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    consent_id: UUID
    patient_id: UUID
    doctor_user_id: UUID
    scope: str
    granted_by_user_id: UUID
    granted_at: datetime
    revoked_at: datetime | None = None
    revoked_by_user_id: UUID | None = None
    expires_at: datetime | None = None
    clinician_display_name: str | None = None
    clinician_role: str | None = None
    reason: str | None = None

    @computed_field
    @property
    def status(self) -> Literal["active", "revoked", "expired"]:
        expiry = self.expires_at
        if expiry and not expiry.tzinfo:
            expiry = expiry.replace(tzinfo=UTC)
        revoked = self.revoked_at
        if revoked and not revoked.tzinfo:
            revoked = revoked.replace(tzinfo=UTC)
        # Expired rows are closed at their expiry when a fresh grant is created.
        if expiry and expiry <= datetime.now(UTC) and (not revoked or revoked >= expiry):
            return "expired"
        return "revoked" if revoked else "active"


class ConsentPage(BaseModel):
    items: list[ConsentOut]
    limit: int
    offset: int
    next_offset: int | None


class ClinicianIdentity(BaseModel):
    user_id: UUID
    display_name: str = Field(min_length=1, max_length=511)
    role: Literal["doctor", "nurse"]


class PatientBundleOut(BaseModel):
    patient: PatientOut
    vitals: list[VitalOut] = Field(default_factory=list)
    consents: list[ConsentOut] = Field(default_factory=list)
