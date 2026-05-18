from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class EventIngest(BaseModel):
    event_id: UUID
    event_type: str = Field(min_length=1, max_length=128)
    source: str = Field(min_length=1, max_length=255)
    subject_user_id: UUID | None = None
    occurred_at: datetime
    booking_id: UUID | None = None
    doctor_id: UUID | None = None
    payment_id: UUID | None = None
    amount_cents: int | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, max_length=8)
    status: str | None = Field(default=None, max_length=32)
    metadata: dict[str, object] = Field(default_factory=dict)
    notes: str | None = None


class FunnelMetricsOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    period_start: date
    period_end: date
    bookings_created: int
    payments_succeeded: int
    bookings_confirmed: int
    booking_to_payment_rate: float
    payment_to_confirmation_rate: float


class RetentionItemOut(BaseModel):
    day: date
    active_users: int
    new_users: int


class RetentionMetricsOut(BaseModel):
    period_start: date
    period_end: date
    items: list[RetentionItemOut] = Field(default_factory=list)


class DoctorScorecardOut(BaseModel):
    doctor_id: UUID
    bookings_created: int
    bookings_confirmed: int
    payments_succeeded: int
    revenue_cents: int
    conversion_rate: float
    average_revenue_per_payment_cents: float