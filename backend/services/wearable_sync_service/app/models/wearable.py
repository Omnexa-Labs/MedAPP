from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, JSON, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base, TimestampMixin


class WearableDevice(Base, TimestampMixin):
    __tablename__ = "wearable_devices"

    owner_user_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    provider: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    external_id: Mapped[str] = mapped_column(String(128), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (UniqueConstraint("owner_user_id", "provider", "external_id", name="uq_wearable_device_source"),)

    @property
    def device_id(self):
        return self.id


class WearableSample(Base, TimestampMixin):
    __tablename__ = "wearable_samples"

    device_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("wearable_devices.id", ondelete="CASCADE"), index=True, nullable=False)
    owner_user_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    value: Mapped[str] = mapped_column(String(128), nullable=False)
    unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    source_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    sync_status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    sync_error: Mapped[str | None] = mapped_column(String(512), nullable=True)
    synced_to_ehr: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    ehr_vital_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)

    @property
    def sample_id(self):
        return self.id