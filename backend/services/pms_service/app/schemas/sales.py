from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .inventory_validation import Money, Units
from .transactions import PaymentInput, TransactionInput


class WalkInSaleItemIn(TransactionInput):
    drug_id: UUID
    quantity: Units
    # Optional override; default is the batch's selling_price_cents.
    unit_price_cents: Money | None = None


class WalkInSaleCreate(PaymentInput):
    customer_id: UUID | None = None
    items: list[WalkInSaleItemIn] = Field(min_length=1, max_length=100)
    discount_cents: Money = 0
    tax_cents: Money = 0

    @field_validator("items")
    @classmethod
    def unique_drugs(cls, items):
        if len({item.drug_id for item in items}) != len(items):
            raise ValueError("include each drug only once")
        return items


class SaleItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sale_id: UUID
    prescription_item_id: UUID | None = None
    corrected_quantity: int = 0
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
    version: int
    notes: str | None
    void_reason: str | None
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
    credited_cents: int = 0
    refunded_cents: int = 0
    refundable_cents: int = 0


class SaleList(BaseModel):
    items: list[SaleOut]
    total: int
    limit: int
    offset: int
