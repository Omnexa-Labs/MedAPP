from __future__ import annotations

from uuid import UUID
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class PurchaseOrderItemIn(BaseModel):
    drug_id: UUID
    quantity: int
    unit_cost_cents: int = 0


class PurchaseOrderCreate(BaseModel):
    supplier_id: UUID
    expected_at: date | None = None
    notes: str | None = None
    currency: str = "GHS"
    items: list[PurchaseOrderItemIn]


class PurchaseOrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    purchase_order_id: UUID
    drug_id: UUID
    quantity: int
    unit_cost_cents: int


class PurchaseOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    po_number: str
    supplier_id: UUID
    status: str
    expected_at: date | None
    total_cents: int
    currency: str
    notes: str | None
    created_at: datetime
    items: list[PurchaseOrderItemOut] = []


class PurchaseOrderList(BaseModel):
    items: list[PurchaseOrderOut]


class ReceiveLine(BaseModel):
    purchase_order_item_id: UUID
    batch_number: str
    quantity_received: int
    unit_cost_cents: int | None = None
    expiry_date: date


class ReceiveGoodsRequest(BaseModel):
    received_at: date
    lines: list[ReceiveLine]
