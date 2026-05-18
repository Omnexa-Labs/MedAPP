from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RoomStatus(StrEnum):
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    ENDED = "ended"


class RoomCreate(BaseModel):
    booking_id: UUID
    patient_id: UUID
    doctor_id: UUID
    scheduled_for: datetime | None = None
    recording_enabled: bool = False


class RoomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    room_id: UUID
    booking_id: UUID
    room_name: str
    status: RoomStatus
    scheduled_for: datetime | None = None
    ended_at: datetime | None = None
    recording_enabled: bool
    created_by_user_id: UUID


class RoomTokenOut(BaseModel):
    room_id: UUID
    token: str
    expires_at: datetime


class RoomJoinOut(BaseModel):
    room_id: UUID
    user_id: UUID
    role: str
    joined_at: datetime | None = None
    left_at: datetime | None = None


class RoomMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class RoomMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    message_id: UUID
    room_id: UUID
    sender_user_id: UUID
    body: str
    created_at: datetime