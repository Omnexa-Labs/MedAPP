from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

Role = Literal["pharmacy_admin", "pharmacist", "cashier"]


class StaffCreate(BaseModel):
    full_name: str
    email: str
    phone: str | None = None
    role: Role
    password: str


class StaffUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    role: Role | None = None
    is_active: bool | None = None
    password: str | None = None


class StaffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    full_name: str
    email: str
    phone: str | None
    role: Role
    is_active: bool
    created_at: datetime


class StaffList(BaseModel):
    items: list[StaffOut]
