from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PatientCreate(BaseModel):
    medapp_user_id: UUID | None = None
    first_name: str = Field(min_length=1, max_length=128)
    last_name: str = Field(min_length=1, max_length=128)
    other_names: str | None = Field(default=None, max_length=128)
    date_of_birth: date | None = None
    gender: str | None = Field(default=None, max_length=16)
    blood_group: str | None = Field(default=None, max_length=8)
    phone_primary: str | None = Field(default=None, max_length=32)
    phone_secondary: str | None = Field(default=None, max_length=32)
    email: str | None = Field(default=None, max_length=255)
    address: str | None = Field(default=None, max_length=512)
    city: str | None = Field(default=None, max_length=128)
    region: str | None = Field(default=None, max_length=128)
    national_id: str | None = Field(default=None, max_length=64)
    insurance_provider: str | None = Field(default=None, max_length=128)
    insurance_policy_number: str | None = Field(default=None, max_length=128)
    emergency_contact_name: str | None = Field(default=None, max_length=255)
    emergency_contact_phone: str | None = Field(default=None, max_length=32)
    emergency_contact_relationship: str | None = Field(default=None, max_length=64)
    allergies: list[str] = Field(default_factory=list)
    chronic_conditions: list[str] = Field(default_factory=list)
    notes: str | None = None


class PatientUpdate(BaseModel):
    first_name: str | None = Field(default=None, max_length=128)
    last_name: str | None = Field(default=None, max_length=128)
    other_names: str | None = Field(default=None, max_length=128)
    date_of_birth: date | None = None
    gender: str | None = Field(default=None, max_length=16)
    blood_group: str | None = Field(default=None, max_length=8)
    phone_primary: str | None = Field(default=None, max_length=32)
    phone_secondary: str | None = Field(default=None, max_length=32)
    email: str | None = Field(default=None, max_length=255)
    address: str | None = Field(default=None, max_length=512)
    city: str | None = Field(default=None, max_length=128)
    region: str | None = Field(default=None, max_length=128)
    national_id: str | None = Field(default=None, max_length=64)
    insurance_provider: str | None = Field(default=None, max_length=128)
    insurance_policy_number: str | None = Field(default=None, max_length=128)
    emergency_contact_name: str | None = Field(default=None, max_length=255)
    emergency_contact_phone: str | None = Field(default=None, max_length=32)
    emergency_contact_relationship: str | None = Field(default=None, max_length=64)
    allergies: list[str] | None = None
    chronic_conditions: list[str] | None = None
    notes: str | None = None


class PatientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    patient_id: UUID
    medapp_user_id: UUID | None = None
    mrn: str
    first_name: str
    last_name: str
    other_names: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    blood_group: str | None = None
    phone_primary: str | None = None
    phone_secondary: str | None = None
    email: str | None = None
    address: str | None = None
    city: str | None = None
    region: str | None = None
    national_id: str | None = None
    insurance_provider: str | None = None
    insurance_policy_number: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    emergency_contact_relationship: str | None = None
    allergies_json: list = Field(default_factory=list)
    chronic_conditions_json: list = Field(default_factory=list)
    notes: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class PatientList(BaseModel):
    items: list[PatientOut] = Field(default_factory=list)
    total: int = 0


class VisitCreate(BaseModel):
    visit_type: str = Field(default="outpatient", max_length=32)
    department_id: UUID | None = None
    assigned_doctor_id: UUID | None = None
    chief_complaint: str | None = None
    vitals: dict | None = None


class VisitUpdate(BaseModel):
    status: str | None = Field(default=None, max_length=32)
    department_id: UUID | None = None
    assigned_doctor_id: UUID | None = None
    chief_complaint: str | None = None
    diagnosis: str | None = None
    treatment_notes: str | None = None
    vitals: dict | None = None


class VisitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    visit_id: UUID
    patient_id: UUID
    visit_type: str
    status: str
    department_id: UUID | None = None
    assigned_doctor_id: UUID | None = None
    chief_complaint: str | None = None
    diagnosis: str | None = None
    treatment_notes: str | None = None
    vitals_json: dict | None = None
    checked_in_at: datetime | None = None
    checked_out_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class VisitList(BaseModel):
    items: list[VisitOut] = Field(default_factory=list)
