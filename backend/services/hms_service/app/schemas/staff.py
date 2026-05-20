from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DepartmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    slug: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9_-]*$")
    description: str | None = None
    head_staff_id: UUID | None = None


class DepartmentUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=128)
    description: str | None = None
    head_staff_id: UUID | None = None
    is_active: bool | None = None


class DepartmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    department_id: UUID
    name: str
    slug: str
    description: str | None = None
    head_staff_id: UUID | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class DepartmentList(BaseModel):
    items: list[DepartmentOut] = Field(default_factory=list)


class StaffCreate(BaseModel):
    user_id: UUID
    employee_id: str | None = Field(default=None, max_length=32)
    first_name: str = Field(min_length=1, max_length=128)
    last_name: str = Field(min_length=1, max_length=128)
    title: str | None = Field(default=None, max_length=64)
    specialty: str | None = Field(default=None, max_length=128)
    qualification: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    email: str | None = Field(default=None, max_length=255)
    department_id: UUID | None = None
    role_in_department: str = Field(default="member", max_length=64)


class StaffUpdate(BaseModel):
    employee_id: str | None = Field(default=None, max_length=32)
    first_name: str | None = Field(default=None, max_length=128)
    last_name: str | None = Field(default=None, max_length=128)
    title: str | None = Field(default=None, max_length=64)
    specialty: str | None = Field(default=None, max_length=128)
    qualification: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    email: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None


class StaffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    staff_id: UUID
    user_id: UUID
    employee_id: str | None = None
    first_name: str
    last_name: str
    title: str | None = None
    specialty: str | None = None
    qualification: str | None = None
    phone: str | None = None
    email: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class StaffList(BaseModel):
    items: list[StaffOut] = Field(default_factory=list)


class ScheduleSlotCreate(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    start_time: str = Field(max_length=8)
    end_time: str = Field(max_length=8)
    is_available: bool = True
    effective_from: date
    effective_until: date | None = None


class ScheduleSlotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    staff_id: UUID
    day_of_week: int
    start_time: str
    end_time: str
    is_available: bool
    effective_from: date
    effective_until: date | None = None
    created_at: datetime
    updated_at: datetime


class DepartmentMembershipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    staff_id: UUID
    department_id: UUID
    role_in_department: str
    is_primary: bool
    created_at: datetime
    updated_at: datetime
