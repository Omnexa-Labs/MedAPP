from __future__ import annotations

from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class CustomerBase(BaseModel):
    full_name: str
    phone: str | None = None
    email: str | None = None
    date_of_birth: date | None = None
    medapp_user_id: str | None = None
    notes: str | None = None


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    email: str | None = None
    date_of_birth: date | None = None
    medapp_user_id: str | None = None
    notes: str | None = None


class CustomerOut(CustomerBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID


class CustomerList(BaseModel):
    items: list[CustomerOut]
