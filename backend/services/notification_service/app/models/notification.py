from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base, TimestampMixin


class DeliveryChannel(StrEnum):
    PUSH = "push"
    SMS = "sms"
    EMAIL = "email"
    IN_APP = "in_app"


class DeliveryStatus(StrEnum):
    QUEUED = "queued"
    SENT = "sent"
    FAILED = "failed"


class NotificationPreference(Base, TimestampMixin):
    __tablename__ = "notification_preferences"

    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, unique=True, index=True)
    locale: Mapped[str] = mapped_column(String(8), nullable=False, default="en")
    push_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sms_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    email_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    in_app_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    @property
    def preference_id(self):
        return self.id


class NotificationDelivery(Base, TimestampMixin):
    __tablename__ = "delivery_log"
    __table_args__ = (UniqueConstraint("event_id", "channel", name="uq_delivery_log_event_channel"),)

    event_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    recipient_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    actor_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True, index=True)
    channel: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    locale: Mapped[str] = mapped_column(String(8), nullable=False, default="en")
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=DeliveryStatus.QUEUED, index=True)
    provider_reference: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    @property
    def delivery_id(self):
        return self.id