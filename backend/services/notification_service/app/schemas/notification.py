from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class NotificationChannel(StrEnum):
    PUSH = "push"
    SMS = "sms"
    EMAIL = "email"
    IN_APP = "in_app"


class NotificationPreferenceUpdate(BaseModel):
    locale: str = Field(default="en", max_length=8)
    push_enabled: bool = True
    sms_enabled: bool = True
    email_enabled: bool = True
    in_app_enabled: bool = True


class NotificationPreferenceOut(NotificationPreferenceUpdate):
    model_config = ConfigDict(from_attributes=True)

    preference_id: UUID
    user_id: UUID


class SendNotificationIn(BaseModel):
    event_id: str = Field(max_length=128)
    recipient_user_id: UUID
    event_type: str = Field(max_length=64)
    title: str = Field(max_length=255)
    body: str
    channels: list[NotificationChannel] = Field(default_factory=lambda: [NotificationChannel.IN_APP])
    locale: str = Field(default="en", max_length=8)
    actor_user_id: UUID | None = None


class NotificationDeliveryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    delivery_id: UUID
    event_id: str
    recipient_user_id: UUID
    actor_user_id: UUID | None
    channel: NotificationChannel
    locale: str
    event_type: str
    title: str
    body: str
    status: str
    provider_reference: str | None
    delivered_at: datetime | None
    error: str | None


class InboxMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    delivery_id: UUID
    event_id: str
    event_type: str
    title: str
    body: str
    channel: NotificationChannel
    status: str
    delivered_at: datetime | None


class InboxList(BaseModel):
    items: list[InboxMessageOut] = Field(default_factory=list)


class TemplatePreviewIn(BaseModel):
    locale: str = Field(default="en", max_length=8)
    title: str = Field(max_length=255)
    body: str