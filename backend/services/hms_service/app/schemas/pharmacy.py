from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DrugCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    brand_name: str | None = Field(default=None, max_length=255)
    category: str = Field(min_length=1, max_length=64)
    form: str = Field(min_length=1, max_length=64)
    strength: str = Field(min_length=1, max_length=64)
    unit: str = Field(min_length=1, max_length=32)
    reorder_level: int = Field(default=10, ge=0)


class DrugUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    brand_name: str | None = Field(default=None, max_length=255)
    category: str | None = Field(default=None, max_length=64)
    form: str | None = Field(default=None, max_length=64)
    strength: str | None = Field(default=None, max_length=64)
    unit: str | None = Field(default=None, max_length=32)
    reorder_level: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class DrugOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    drug_id: UUID
    name: str
    brand_name: str | None = None
    category: str
    form: str
    strength: str
    unit: str
    reorder_level: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class DrugList(BaseModel):
    items: list[DrugOut] = Field(default_factory=list)


class DrugBatchCreate(BaseModel):
    batch_number: str = Field(min_length=1, max_length=64)
    quantity_received: int = Field(ge=1)
    unit_cost_cents: int = Field(default=0, ge=0)
    selling_price_cents: int = Field(default=0, ge=0)
    currency: str = Field(default="GHS", max_length=3)
    supplier: str | None = Field(default=None, max_length=255)
    received_at: date
    expiry_date: date


class DrugBatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    drug_id: UUID
    batch_number: str
    quantity_received: int
    quantity_remaining: int
    unit_cost_cents: int
    selling_price_cents: int
    currency: str
    supplier: str | None = None
    received_at: date
    expiry_date: date
    created_at: datetime
    updated_at: datetime


class PrescriptionItemCreate(BaseModel):
    drug_id: UUID
    dosage: str = Field(min_length=1, max_length=128)
    quantity_prescribed: int = Field(ge=1)
    duration_days: int | None = Field(default=None, ge=1)
    instructions: str | None = Field(default=None, max_length=512)


class PrescriptionCreate(BaseModel):
    visit_id: UUID
    patient_id: UUID
    items: list[PrescriptionItemCreate] = Field(min_length=1)
    notes: str | None = None


class PrescriptionItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    prescription_id: UUID
    drug_id: UUID
    dosage: str
    quantity_prescribed: int
    quantity_dispensed: int
    duration_days: int | None = None
    instructions: str | None = None
    created_at: datetime
    updated_at: datetime


class PrescriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    prescription_id: UUID
    visit_id: UUID
    patient_id: UUID
    prescribed_by_staff_id: UUID
    status: str
    notes: str | None = None
    items: list[PrescriptionItemOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class PrescriptionList(BaseModel):
    items: list[PrescriptionOut] = Field(default_factory=list)


class DispenseItemRequest(BaseModel):
    prescription_item_id: UUID
    drug_batch_id: UUID
    quantity: int = Field(ge=1)


class DispenseRequest(BaseModel):
    items: list[DispenseItemRequest] = Field(min_length=1)


class StockAlertOut(BaseModel):
    drug_id: UUID
    drug_name: str
    category: str
    quantity_remaining: int
    reorder_level: int
    alert_type: str


class StockAlertList(BaseModel):
    items: list[StockAlertOut] = Field(default_factory=list)
