from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class HmsRole(StrEnum):
    HOSPITAL_ADMIN = "hospital_admin"
    DEPARTMENT_HEAD = "department_head"
    DOCTOR = "doctor"
    NURSE = "nurse"
    PHARMACIST = "pharmacist"
    BILLING_CLERK = "billing_clerk"
    RECEPTIONIST = "receptionist"
    LAB_TECH = "lab_tech"


class TenantCreate(BaseModel):
    hospital_id: UUID
    hospital_name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=128, pattern=r"^[a-z0-9][a-z0-9_-]*$")
    config: dict = Field(
        default_factory=lambda: {
            "branding": {"primary_color": "#1A5276", "accent_color": "#27AE60"},
            "locale": {
                "timezone": "Africa/Accra",
                "currency": "GHS",
                "date_format": "DD/MM/YYYY",
                "language": "en",
            },
            "modules": {
                "patients": True,
                "staff": True,
                "appointments": True,
                "pharmacy": True,
                "billing": True,
                "dashboard": True,
            },
            "features": {
                "walk_in_queue": True,
                "auto_mrn_generation": True,
                "mrn_prefix": "MRN",
            },
            "departments_seed": [
                "General",
                "Emergency",
                "Pharmacy",
                "Laboratory",
                "Surgery",
                "Pediatrics",
                "Obstetrics & Gynecology",
                "Radiology",
            ],
        }
    )
    notes: str | None = None


class TenantConfigUpdate(BaseModel):
    config: dict


class TenantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tenant_id: UUID
    hospital_name: str
    slug: str
    is_active: bool
    provisioned_at: datetime | None = None
    config_json: dict = Field(default_factory=dict)
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class TenantList(BaseModel):
    items: list[TenantOut] = Field(default_factory=list)


class HmsStaffRoleAssign(BaseModel):
    user_id: UUID
    hms_role: HmsRole
    department_id: UUID | None = None


class HmsStaffRoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    user_id: UUID
    hms_role: str
    department_id: UUID | None = None
    is_active: bool
    version: int
    created_at: datetime
    updated_at: datetime
