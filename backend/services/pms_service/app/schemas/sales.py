from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class WalkInSaleItemIn(BaseModel):
    drug_id: UUID
    quantity: int
    # Optional override; default is the batch's selling_price_cents.
    unit_price_cents: int | None = None


class WalkInSaleCreate(BaseModel):
    customer_id: UUID | None = None
    items: list[WalkInSaleItemIn]
    payment_method: str = "cash"  # cash|card|mobile_money|insurance
    payment_ref: str | None = None
    discount_cents: int = 0
    tax_cents: int = 0
    notes: str | None = None


class SaleItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sale_id: UUID
    drug_id: UUID
    drug_batch_id: UUID
    drug_name_snapshot: str
    quantity: int
    unit_price_cents: int
    line_total_cents: int


class SaleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sale_number: str
    prescription_id: UUID | None
    customer_id: UUID | None
    cashier_staff_id: UUID | None
    subtotal_cents: int
    discount_cents: int
    tax_cents: int
    total_cents: int
    currency: str
    payment_method: str
    payment_ref: str | None
    status: str
    completed_at: datetime | None
    created_at: datetime
    items: list[SaleItemOut] = []


class SaleList(BaseModel):
    items: list[SaleOut]
