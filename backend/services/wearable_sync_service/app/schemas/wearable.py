from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class WearableDeviceCreate(BaseModel):
    provider: str = Field(min_length=1, max_length=64)
    external_id: str = Field(min_length=1, max_length=128)
    display_name: str | None = Field(default=None, max_length=255)


class WearableDeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    device_id: UUID
    owner_user_id: UUID
    provider: str
    external_id: str
    display_name: str | None = None
    is_active: bool
    last_synced_at: datetime | None = None


class WearableDeviceList(BaseModel):
    items: list[WearableDeviceOut] = Field(default_factory=list)


class WearableSampleCreate(BaseModel):
    kind: str = Field(min_length=1, max_length=64)
    value: str = Field(min_length=1, max_length=128)
    unit: str | None = Field(default=None, max_length=32)
    recorded_at: datetime
    source_payload: dict = Field(default_factory=dict)


class WearableSampleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sample_id: UUID
    device_id: UUID
    owner_user_id: UUID
    kind: str
    value: str
    unit: str | None = None
    recorded_at: datetime
    source_payload: dict = Field(default_factory=dict)
    sync_status: str
    sync_error: str | None = None
    synced_to_ehr: bool
    ehr_vital_id: UUID | None = None


class WearableSampleList(BaseModel):
    items: list[WearableSampleOut] = Field(default_factory=list)


class WearableSyncRequest(BaseModel):
    device: WearableDeviceCreate
    samples: list[WearableSampleCreate] = Field(default_factory=list, min_length=1)


class WearableSyncResult(BaseModel):
    device: WearableDeviceOut
    synced_count: int
    failed_count: int
    samples: list[WearableSampleOut] = Field(default_factory=list)