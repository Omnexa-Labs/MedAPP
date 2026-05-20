from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class InvoiceLineItemCreate(BaseModel):
    description: str = Field(min_length=1, max_length=255)
    category: str = Field(default="other", max_length=64)
    quantity: int = Field(default=1, ge=1)
    unit_price_cents: int = Field(ge=0)


class InvoiceCreate(BaseModel):
    visit_id: UUID | None = None
    patient_id: UUID
    items: list[InvoiceLineItemCreate] = Field(default_factory=list)
    currency: str = Field(default="GHS", max_length=3)
    notes: str | None = None


class InvoiceUpdate(BaseModel):
    status: str | None = Field(default=None, max_length=32)
    notes: str | None = None


class InvoiceLineItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    invoice_id: UUID
    description: str
    category: str
    quantity: int
    unit_price_cents: int
    total_cents: int
    created_at: datetime
    updated_at: datetime


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    invoice_id: UUID
    visit_id: UUID | None = None
    patient_id: UUID
    invoice_number: str
    status: str
    total_amount_cents: int
    paid_amount_cents: int
    currency: str
    issued_at: datetime | None = None
    due_at: datetime | None = None
    notes: str | None = None
    created_by_staff_id: UUID
    line_items: list[InvoiceLineItemOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class InvoiceList(BaseModel):
    items: list[InvoiceOut] = Field(default_factory=list)


class PaymentCreate(BaseModel):
    amount_cents: int = Field(ge=1)
    currency: str = Field(default="GHS", max_length=3)
    method: str = Field(min_length=1, max_length=32)
    reference: str | None = Field(default=None, max_length=128)
    notes: str | None = Field(default=None, max_length=512)


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    invoice_id: UUID
    amount_cents: int
    currency: str
    method: str
    reference: str | None = None
    received_by_staff_id: UUID | None = None
    received_at: datetime
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class BillingSummaryOut(BaseModel):
    total_revenue_cents: int = 0
    total_outstanding_cents: int = 0
    invoices_issued: int = 0
    invoices_paid: int = 0
    currency: str = "GHS"
