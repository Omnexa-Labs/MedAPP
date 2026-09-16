from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .inventory_validation import Money, Units


class BatchCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    drug_id: UUID
    supplier_id: UUID | None = None
    batch_number: str = Field(min_length=1, max_length=64)
    quantity_received: Units
    unit_cost_cents: Money = 0
    selling_price_cents: Money | None = None
    currency: str | None = Field(None, pattern=r"^[A-Z]{3}$")
    received_at: date
    expiry_date: date

    @model_validator(mode="after")
    def valid_dates(self):
        if self.expiry_date < self.received_at:
            raise ValueError("Expiry cannot precede the received date.")
        return self


class BatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    version: int
    drug_name: str | None = None
    drug_id: UUID
    supplier_id: UUID | None
    purchase_order_id: UUID | None
    purchase_order_item_id: UUID | None = None
    delivery_reference: str | None = None
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
    inventory_date: date
    total: int = 0
    limit: int = 200
    offset: int = 0


class StockAdjustment(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    version: int = Field(ge=1, strict=True)
    delta: int = Field(strict=True, ge=-1_000_000, le=1_000_000)
    reason: Literal["adjust", "expire", "return"]
    note: str = Field(min_length=5, max_length=255)

    @model_validator(mode="after")
    def direction(self):
        if (
            self.delta == 0
            or (self.reason == "expire" and self.delta > 0)
            or (self.reason == "return" and self.delta < 0)
        ):
            raise ValueError(
                "Use a nonzero adjustment; expiry removes units and returns add units."
            )
        return self


class MovementOut(BaseModel):
    id: UUID
    delta: int
    reason: str
    note: str | None
    actor_staff_id: UUID | None
    actor_name: str | None
    created_at: datetime


class MovementList(BaseModel):
    items: list[MovementOut]
    has_more: bool
