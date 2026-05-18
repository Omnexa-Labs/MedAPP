from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


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


class ConsentCreate(BaseModel):
    doctor_user_id: UUID
    scope: str = Field(default="records", max_length=64)
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


class PatientBundleOut(BaseModel):
    patient: PatientOut
    vitals: list[VitalOut] = Field(default_factory=list)
    consents: list[ConsentOut] = Field(default_factory=list)