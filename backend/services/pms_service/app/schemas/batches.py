from __future__ import annotations

from uuid import UUID
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class BatchCreate(BaseModel):
    drug_id: UUID
    supplier_id: UUID | None = None
    batch_number: str
    quantity_received: int
    unit_cost_cents: int = 0
    selling_price_cents: int = 0
    currency: str = "GHS"
    received_at: date
    expiry_date: date


class BatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    drug_id: UUID
    supplier_id: UUID | None
    purchase_order_id: UUID | None
    batch_number: str
    quantity_received: int
    quantity_on_hand: int
    unit_cost_cents: int
    selling_price_cents: int
    currency: str
    received_at: date
    expiry_date: date
    created_at: datetime


class BatchList(BaseModel):
    items: list[BatchOut]


class StockAdjustment(BaseModel):
    delta: int  # negative for write-off, positive for found stock
    reason: str  # adjust|expire|return
    note: str | None = None
