from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AppointmentCreate(BaseModel):
    patient_id: UUID
    doctor_staff_id: UUID
    department_id: UUID | None = None
    appointment_type: str = Field(default="scheduled", max_length=32)
    scheduled_date: date
    scheduled_start: str = Field(max_length=8)
    scheduled_end: str = Field(max_length=8)
    reason: str | None = Field(default=None, max_length=512)
    notes: str | None = None


class AppointmentUpdate(BaseModel):
    status: str | None = Field(default=None, max_length=32)
    cancellation_reason: str | None = Field(default=None, max_length=512)
    notes: str | None = None


class AppointmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    appointment_id: UUID
    patient_id: UUID
    doctor_staff_id: UUID
    department_id: UUID | None = None
    appointment_type: str
    status: str
    scheduled_date: date
    scheduled_start: str
    scheduled_end: str
    reason: str | None = None
    notes: str | None = None
    cancelled_at: datetime | None = None
    cancellation_reason: str | None = None
    created_at: datetime
    updated_at: datetime


class AppointmentList(BaseModel):
    items: list[AppointmentOut] = Field(default_factory=list)


class QueueEntryCreate(BaseModel):
    patient_id: UUID
    visit_id: UUID | None = None
    department_id: UUID | None = None
    assigned_staff_id: UUID | None = None
    queue_type: str = Field(default="walk_in", max_length=32)
    priority: int = Field(default=3, ge=1, le=3)


class QueueEntryUpdate(BaseModel):
    status: str | None = Field(default=None, max_length=32)
    assigned_staff_id: UUID | None = None


class QueueEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    queue_entry_id: UUID
    patient_id: UUID
    visit_id: UUID | None = None
    department_id: UUID | None = None
    assigned_staff_id: UUID | None = None
    queue_type: str
    priority: int
    status: str
    ticket_number: str
    joined_at: datetime
    called_at: datetime | None = None
    completed_at: datetime | None = None
    estimated_wait_minutes: int | None = None
    created_at: datetime
    updated_at: datetime


class QueueEntryList(BaseModel):
    items: list[QueueEntryOut] = Field(default_factory=list)


class QueueStatsOut(BaseModel):
    total_waiting: int = 0
    total_serving: int = 0
    avg_wait_minutes: float = 0.0
    by_department: dict = Field(default_factory=dict)
