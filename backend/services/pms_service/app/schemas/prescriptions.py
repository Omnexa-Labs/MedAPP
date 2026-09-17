from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .inventory_validation import Units
from .transactions import PaymentInput, TransactionInput, Version


class PrescriptionItemIn(TransactionInput):
    drug_id: UUID
    quantity_prescribed: Units
    dosage_instructions: str | None = Field(None, max_length=512)


class PrescriptionCreate(TransactionInput):
    customer_id: UUID | None = None
    prescriber_name: str | None = Field(None, max_length=255)
    prescriber_license: str | None = Field(None, max_length=64)
    source: Literal["walk_in", "internal"] = "walk_in"
    notes: str | None = Field(None, max_length=2000)
    items: list[PrescriptionItemIn] = Field(min_length=1, max_length=100)


class PrescriptionItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    prescription_id: UUID
    drug_id: UUID
    drug_name_snapshot: str
    quantity_prescribed: int
    quantity_dispensed: int
    dosage_instructions: str | None


class PrescriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    rx_number: str
    version: int
    cancellation_reason: str | None
    valid_until: date | None = None
    source: str
    external_ref: str | None
    customer_id: UUID | None
    prescriber_name: str | None
    prescriber_license: str | None
    status: str
    notes: str | None
    created_at: datetime
    items: list[PrescriptionItemOut] = []


class PrescriptionList(BaseModel):
    items: list[PrescriptionOut]
    total: int
    limit: int
    offset: int


class DispenseItemIn(TransactionInput):
    prescription_item_id: UUID
    quantity: Units


class DispenseRequest(PaymentInput):
    version: Version
    items: list[DispenseItemIn] = Field(min_length=1, max_length=100)

    @field_validator("items")
    @classmethod
    def unique_items(cls, items):
        if len({item.prescription_item_id for item in items}) != len(items):
            raise ValueError("include each prescription item only once")
        return items


class DispenseResultLine(BaseModel):
    prescription_item_id: UUID
    dispensed_quantity: int
    from_batches: list[dict]


class DispenseResult(BaseModel):
    prescription_id: UUID
    rx_status: str
    rx_version: int
    sale_id: UUID
    sale_number: str
    sale_total_cents: int
    currency: str
    lines: list[DispenseResultLine]
