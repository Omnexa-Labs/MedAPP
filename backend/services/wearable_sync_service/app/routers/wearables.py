from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from .. import events
from ..deps import DbSession, get_current_principal
from ..schemas.wearable import (
    WearableDeviceCreate,
    WearableDeviceList,
    WearableDeviceOut,
    WearableSampleList,
    WearableSampleOut,
    WearableSyncRequest,
    WearableSyncResult,
    WearableSummaryOut,
)
from ..services import create_or_update_device, get_wearable_summary, list_device_samples, list_devices, sync_wearable_samples

router = APIRouter(prefix="/v1/wearables", tags=["Wearables"])


@router.post("/devices", response_model=WearableDeviceOut, status_code=status.HTTP_201_CREATED)
async def register_device(
    payload: WearableDeviceCreate,
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
):
    device = await create_or_update_device(db, principal, payload)
    return WearableDeviceOut.model_validate(device)


@router.get("/devices", response_model=WearableDeviceList)
async def read_devices(db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    devices = await list_devices(db, principal)
    return WearableDeviceList(items=[WearableDeviceOut.model_validate(device) for device in devices])


@router.get("/devices/{device_id}/samples", response_model=WearableSampleList)
async def read_samples(
    device_id: UUID,
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
):
    samples = await list_device_samples(db, principal, device_id)
    return WearableSampleList(items=[WearableSampleOut.model_validate(sample) for sample in samples])


@router.get("/summary", response_model=WearableSummaryOut)
async def read_summary(db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    return await get_wearable_summary(db, principal)


@router.post("/sync", response_model=WearableSyncResult, status_code=status.HTTP_201_CREATED)
async def sync_samples(
    payload: WearableSyncRequest,
    request: Request,
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
):
    result = await sync_wearable_samples(db, principal, payload, request.app.state.http)
    # Audit finding B-20: write the event to the outbox INSIDE the same
    # DB session as the sample rows. The DB-session dep commits both
    # atomically on yield-exit, so a broker outage CANNOT lose the event
    # — the background drain worker picks it up when rabbit is back.
    # Only enqueue when at least one sample reached EHR (0-synced batch
    # carries no new clinical signal).
    if result.synced_count > 0:
        await events.enqueue_outbox(
            db,
            event_type="wearable.vitals.uploaded",
            subject=principal.subject,
            data={
                "patient_id": principal.subject,
                "synced_count": result.synced_count,
                "failed_count": result.failed_count,
                "device": {
                    "provider": result.device.provider,
                    "external_id": result.device.external_id,
                },
                "sample_kinds": sorted({s.kind for s in result.samples if s.sync_status == "synced"}),
            },
        )
    return result