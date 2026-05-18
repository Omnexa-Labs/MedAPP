from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PaymentStatus(StrEnum):
    PENDING = "pending"
    REQUIRES_ACTION = "requires_action"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    REFUNDED = "refunded"
    CANCELED = "canceled"


class PaymentMethod(StrEnum):
    STRIPE = "stripe"
    MPESA = "mpesa"
    MOMO = "momo"


class PaymentCreate(BaseModel):
    booking_id: UUID | None = None
    amount_cents: int = Field(gt=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    method: PaymentMethod
    idempotency_key: str | None = Field(default=None, max_length=128)
    description: str | None = Field(default=None, max_length=255)
    metadata: dict[str, str] | None = None


class PaymentRefundCreate(BaseModel):
    amount_cents: int | None = Field(default=None, gt=0)
    reason: str | None = Field(default=None, max_length=255)


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    payment_id: UUID
    user_id: UUID
    booking_id: UUID | None
    amount_cents: int
    currency: str
    method: PaymentMethod
    status: PaymentStatus
    provider_reference: str
    idempotency_key: str | None
    description: str | None
    metadata_json: dict[str, str] | None
    confirmed_at: datetime | None = None
    failed_at: datetime | None = None


class PaymentRefundOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    refund_id: UUID
    payment_id: UUID
    amount_cents: int
    reason: str | None
    status: str
    provider_reference: str | None
    processed_at: datetime | None = None


class PaymentEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    provider_event_id: UUID
    provider: str
    event_id: str
    payment_id: UUID | None
    parsed_status: str | None
    error: str | None = None


class WebhookIn(BaseModel):
    event_id: str = Field(max_length=128)
    payment_reference: str = Field(max_length=128)
    status: PaymentStatus
    payment_id: UUID | None = None
    amount_cents: int | None = Field(default=None, gt=0)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    raw: dict[str, object] = Field(default_factory=dict)