from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ThreadStatus(StrEnum):
    OPEN = "open"
    PENDING = "pending"
    CLOSED = "closed"


class ThreadCreate(BaseModel):
    subject: str = Field(min_length=1, max_length=255)
    source: str = Field(default="direct", max_length=32)
    participant_user_ids: list[UUID] = Field(default_factory=list)
    participant_roles: list[str] = Field(default_factory=list)
    assigned_role: str | None = Field(default=None, max_length=32)
    booking_id: UUID | None = None


class HandoffCreate(BaseModel):
    user_id: UUID
    assigned_role: str
    subject: str = Field(min_length=1, max_length=255)
    summary: str = Field(min_length=1, max_length=2000)
    booking_id: UUID | None = None
    locale: str = Field(default="en", max_length=8)


class ThreadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    thread_id: UUID
    subject: str
    source: str
    status: ThreadStatus
    created_by_user_id: UUID
    assigned_role: str | None
    assigned_user_id: UUID | None
    booking_id: UUID | None
    last_message_at: datetime | None = None


class ThreadParticipantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    participant_id: UUID
    thread_id: UUID
    user_id: UUID
    role: str
    joined_at: datetime | None = None
    last_read_at: datetime | None = None
    is_active: bool


class ThreadMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class ThreadMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    message_id: UUID
    thread_id: UUID
    sender_user_id: UUID | None
    sender_role: str
    body: str
    is_internal: bool
    created_at: datetime


class ThreadList(BaseModel):
    items: list[ThreadOut] = Field(default_factory=list)