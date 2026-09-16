from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .inventory_validation import Money, Units

OrderStatus = Literal["draft", "sent", "partially_received", "received", "cancelled"]


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class PurchaseOrderItemIn(StrictInput):
    drug_id: UUID
    quantity: Units
    unit_cost_cents: Money = 0


class PurchaseOrderCreate(StrictInput):
    supplier_id: UUID
    expected_at: date | None = None
    notes: str | None = Field(None, max_length=4000)
    currency: str | None = Field(None, pattern=r"^[A-Z]{3}$")
    items: list[PurchaseOrderItemIn] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def items_valid(self):
        if len({line.drug_id for line in self.items}) != len(self.items):
            raise ValueError(
                "Use one order line per drug. Split batches when recording the delivery."
            )
        if sum(line.quantity * line.unit_cost_cents for line in self.items) > 2_147_483_647:
            raise ValueError("The order total exceeds the supported amount.")
        return self


class PurchaseOrderUpdate(PurchaseOrderCreate):
    version: int = Field(ge=1, strict=True)


class OrderVersion(StrictInput):
    version: int = Field(ge=1, strict=True)


class CancelOrder(OrderVersion):
    reason: str = Field(min_length=5, max_length=255)


class PurchaseOrderItemOut(BaseModel):
    id: UUID
    purchase_order_id: UUID
    drug_id: UUID
    drug_name: str
    quantity: int
    quantity_received: int | None
    quantity_outstanding: int | None
    quantity_cancelled: int | None
    unit_cost_cents: int


class PurchaseOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    version: int
    po_number: str
    supplier_id: UUID
    supplier_name: str
    status: OrderStatus
    receiving_reconciled: bool
    cancellation_reason: str | None
    expected_at: date | None
    total_cents: int
    currency: str
    notes: str | None
    created_at: datetime
    items: list[PurchaseOrderItemOut]


class PurchaseOrderList(BaseModel):
    items: list[PurchaseOrderOut]
    total: int
    limit: int
    offset: int
    currency: str


class ReceiveLine(StrictInput):
    purchase_order_item_id: UUID
    batch_number: str = Field(min_length=1, max_length=64)
    quantity_received: Units
    unit_cost_cents: Money | None = None
    selling_price_cents: Money | None = None
    expiry_date: date


class ReceiveGoodsRequest(OrderVersion):
    received_at: date
    delivery_reference: str | None = Field(None, max_length=64)
    lines: list[ReceiveLine] = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def dates(self):
        if any(line.expiry_date < self.received_at for line in self.lines):
            raise ValueError("Expiry cannot precede the received date.")
        return self


class ReceiptAllocation(StrictInput):
    batch_id: UUID
    purchase_order_item_id: UUID


class ReconcileReceipts(OrderVersion):
    note: str = Field(min_length=5, max_length=1000)
    allocations: list[ReceiptAllocation] = Field(min_length=1, max_length=500)


class OrderHistoryItem(BaseModel):
    id: UUID
    action: str
    actor_name: str | None
    created_at: datetime
    details: dict


class OrderHistory(BaseModel):
    items: list[OrderHistoryItem]
    has_more: bool
