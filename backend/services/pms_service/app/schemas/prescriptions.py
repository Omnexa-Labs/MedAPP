from __future__ import annotations

from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PrescriptionItemIn(BaseModel):
    drug_id: UUID
    quantity_prescribed: int
    dosage_instructions: str | None = None


class PrescriptionCreate(BaseModel):
    customer_id: UUID | None = None
    prescriber_name: str | None = None
    prescriber_license: str | None = None
    source: str = "walk_in"  # walk_in|internal — medapp comes via /integrations
    notes: str | None = None
    items: list[PrescriptionItemIn]


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


class DispenseItemIn(BaseModel):
    prescription_item_id: UUID
    quantity: int


class DispenseRequest(BaseModel):
    items: list[DispenseItemIn]
    payment_method: str = "cash"
    payment_ref: str | None = None
    notes: str | None = None


class DispenseResultLine(BaseModel):
    prescription_item_id: UUID
    dispensed_quantity: int
    from_batches: list[dict]


class DispenseResult(BaseModel):
    prescription_id: UUID
    rx_status: str
    sale_id: UUID
    sale_total_cents: int
    currency: str
    lines: list[DispenseResultLine]
