from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .inventory_validation import Money, Units
from .transactions import CancelTransaction, PaymentMethod, TransactionInput, Version


class CorrectionLine(TransactionInput):
    sale_item_id: UUID
    quantity: Units


class CorrectionCreate(CancelTransaction):
    prescription_version: Version | None = None
    kind: Literal["not_collected", "customer_return"]
    stock_confirmed: Literal[True]
    items: list[CorrectionLine] = Field(min_length=1, max_length=200)

    @field_validator("items")
    @classmethod
    def unique_lines(cls, lines):
        if len({line.sale_item_id for line in lines}) != len(lines):
            raise ValueError("include each receipt line only once")
        return lines


class RefundCreate(CancelTransaction):
    amount_cents: Money = Field(gt=0)
    payment_method: PaymentMethod
    payment_ref: str = Field(min_length=3, max_length=128)
    payment_confirmed: Literal[True]


class RefundVoid(CancelTransaction):
    entry_was_incorrect: Literal[True]


class PrescriptionAllocation(TransactionInput):
    sale_item_id: UUID
    prescription_item_id: UUID


class ReconcilePrescription(CancelTransaction):
    prescription_version: Version
    allocations: list[PrescriptionAllocation] = Field(min_length=1, max_length=200)


class CorrectionItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    sale_item_id: UUID
    quantity: int
    credit_cents: int


class CorrectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    sale_id: UUID
    number: str
    kind: str
    reason: str
    credit_cents: int
    actor_staff_id: UUID
    actor_name: str | None = None
    created_at: datetime
    items: list[CorrectionItemOut] = []


class RefundOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    sale_id: UUID
    number: str
    amount_cents: int
    payment_method: str
    payment_ref: str
    reason: str
    actor_staff_id: UUID
    actor_name: str | None = None
    created_at: datetime
    status: str
    void_reason: str | None
    voided_at: datetime | None
    voided_by: UUID | None


class CorrectionQuote(BaseModel):
    credit_cents: int
    currency: str
    items: list[CorrectionItemOut]


class CorrectionList(BaseModel):
    items: list[CorrectionOut]
    total: int
    limit: int
    offset: int


class RefundList(BaseModel):
    items: list[RefundOut]
    total: int
    limit: int
    offset: int
