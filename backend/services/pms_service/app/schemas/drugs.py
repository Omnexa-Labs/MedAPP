from __future__ import annotations

from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DrugCreate(BaseModel):
    name: str
    brand_name: str | None = None
    sku: str | None = None
    category: str
    form: str
    strength: str
    unit: str
    reorder_level: int = 10
    default_selling_price_cents: int = 0
    currency: str = "GHS"
    requires_prescription: bool = False
    notes: str | None = None


class DrugUpdate(BaseModel):
    name: str | None = None
    brand_name: str | None = None
    sku: str | None = None
    category: str | None = None
    form: str | None = None
    strength: str | None = None
    unit: str | None = None
    reorder_level: int | None = None
    default_selling_price_cents: int | None = None
    requires_prescription: bool | None = None
    is_active: bool | None = None
    notes: str | None = None


class DrugOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    brand_name: str | None
    sku: str | None
    category: str
    form: str
    strength: str
    unit: str
    reorder_level: int
    default_selling_price_cents: int
    currency: str
    requires_prescription: bool
    is_active: bool
    notes: str | None
    created_at: datetime


class DrugWithStock(DrugOut):
    quantity_on_hand: int
    is_low_stock: bool


class DrugList(BaseModel):
    items: list[DrugWithStock]


class StockAlertOut(BaseModel):
    drug_id: UUID
    drug_name: str
    quantity_on_hand: int
    reorder_level: int


class StockAlertList(BaseModel):
    items: list[StockAlertOut]


class ExpiringBatchOut(BaseModel):
    batch_id: UUID
    drug_id: UUID
    drug_name: str
    batch_number: str
    quantity_on_hand: int
    expiry_date: str


class ExpiringBatchList(BaseModel):
    items: list[ExpiringBatchOut]
