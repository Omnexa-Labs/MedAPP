from __future__ import annotations

from uuid import UUID

import httpx
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal
from shared.auth.jwt import issue_access_token

from ..config import settings
from ..models.wearable import WearableDevice, WearableSample
from ..schemas.wearable import (
    WearableDeviceCreate,
    WearableDeviceOut,
    WearableSampleCreate,
    WearableSampleOut,
    WearableSyncRequest,
    WearableSyncResult,
    WearableSummaryOut,
)


class WearableSyncError(RuntimeError):
    pass


def _principal_uuid(principal: Principal) -> UUID:
    try:
        return UUID(principal.subject)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid principal subject") from exc


def _ehr_token() -> str:
    return issue_access_token(
        subject=settings.service_name,
        role="admin",
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        ttl_minutes=5,
    )


def _sample_note(device: WearableDevice) -> str:
    return f"wearable sync from {device.provider}:{device.external_id}"


async def create_or_update_device(session: AsyncSession, principal: Principal, payload: WearableDeviceCreate) -> WearableDevice:
    owner_user_id = _principal_uuid(principal)
    owner_user_id_text = str(owner_user_id)
    device = await session.scalar(
        select(WearableDevice).where(
            WearableDevice.owner_user_id == owner_user_id_text,
            WearableDevice.provider == payload.provider,
            WearableDevice.external_id == payload.external_id,
        )
    )
    if device is None:
        device = WearableDevice(
            owner_user_id=owner_user_id_text,
            provider=payload.provider,
            external_id=payload.external_id,
            display_name=payload.display_name,
        )
        session.add(device)
    else:
        device.display_name = payload.display_name or device.display_name
        device.is_active = True
    await session.flush()
    return device


async def list_devices(session: AsyncSession, principal: Principal) -> list[WearableDevice]:
    owner_user_id = _principal_uuid(principal)
    owner_user_id_text = str(owner_user_id)
    result = await session.scalars(
        select(WearableDevice).where(WearableDevice.owner_user_id == owner_user_id_text).order_by(WearableDevice.created_at.desc())
    )
    return list(result.all())


async def list_device_samples(session: AsyncSession, principal: Principal, device_id: UUID) -> list[WearableSample]:
    owner_user_id = _principal_uuid(principal)
    owner_user_id_text = str(owner_user_id)
    result = await session.scalars(
        select(WearableSample)
        .where(WearableSample.owner_user_id == owner_user_id_text, WearableSample.device_id == device_id)
        .order_by(WearableSample.recorded_at.asc())
    )
    return list(result.all())


async def get_wearable_summary(session: AsyncSession, principal: Principal) -> WearableSummaryOut:
    owner_user_id = _principal_uuid(principal)
    owner_user_id_text = str(owner_user_id)

    totals_stmt = select(
        func.count(WearableDevice.id),
        func.count(WearableDevice.id).filter(WearableDevice.is_active.is_(True)),
    ).where(WearableDevice.owner_user_id == owner_user_id_text)
    totals_result = await session.execute(totals_stmt)
    total_devices, active_devices = totals_result.one()

    sample_totals_stmt = select(
        func.count(WearableSample.id),
        func.count(WearableSample.id).filter(WearableSample.synced_to_ehr.is_(True)),
        func.count(WearableSample.id).filter(WearableSample.sync_status == "failed"),
    ).where(WearableSample.owner_user_id == owner_user_id_text)
    sample_totals_result = await session.execute(sample_totals_stmt)
    total_samples, synced_samples, failed_samples = sample_totals_result.one()

    recent_samples_result = await session.scalars(
        select(WearableSample)
        .where(WearableSample.owner_user_id == owner_user_id_text)
        .order_by(WearableSample.recorded_at.desc(), WearableSample.created_at.desc())
        .limit(5)
    )
    recent_samples = list(recent_samples_result.all())

    return WearableSummaryOut(
        total_devices=total_devices or 0,
        active_devices=active_devices or 0,
        total_samples=total_samples or 0,
        synced_samples=synced_samples or 0,
        failed_samples=failed_samples or 0,
        recent_samples=[WearableSampleOut.model_validate(sample) for sample in recent_samples],
    )


async def _push_sample_to_ehr(client: httpx.AsyncClient, owner_user_id: UUID, device: WearableDevice, sample: WearableSampleCreate) -> UUID:
    response = await client.post(
        f"{settings.ehr_service_url}/v1/patients/{owner_user_id}/vitals",
        headers={"Authorization": f"Bearer {_ehr_token()}"},
        json={
            "kind": sample.kind,
            "value": sample.value,
            "unit": sample.unit,
            "recorded_at": sample.recorded_at.isoformat(),
            "note": _sample_note(device),
        },
    )
    if response.status_code >= 400:
        raise WearableSyncError(response.text)
    payload = response.json()
    try:
        return UUID(str(payload["vital_id"]))
    except Exception as exc:  # noqa: BLE001
        raise WearableSyncError("missing vital_id in EHR response") from exc


async def sync_wearable_samples(
    session: AsyncSession,
    principal: Principal,
    payload: WearableSyncRequest,
    http_client: httpx.AsyncClient,
) -> WearableSyncResult:
    owner_user_id = _principal_uuid(principal)
    owner_user_id_text = str(owner_user_id)
    device = await create_or_update_device(session, principal, payload.device)
    synced_count = 0
    failed_count = 0
    sample_rows: list[WearableSampleOut] = []

    for sample in payload.samples:
        row = WearableSample(
            device_id=device.id,
            owner_user_id=owner_user_id_text,
            kind=sample.kind,
            value=sample.value,
            unit=sample.unit,
            recorded_at=sample.recorded_at,
            source_payload={**sample.source_payload, "provider": device.provider, "external_id": device.external_id},
        )
        session.add(row)
        await session.flush()

        try:
            row.ehr_vital_id = await _push_sample_to_ehr(http_client, owner_user_id, device, sample)
            row.sync_status = "synced"
            row.synced_to_ehr = True
            row.sync_error = None
            synced_count += 1
        except WearableSyncError as exc:
            row.sync_status = "failed"
            row.synced_to_ehr = False
            row.sync_error = str(exc)[:512]
            failed_count += 1
        device.last_synced_at = max(device.last_synced_at or sample.recorded_at, sample.recorded_at)
        sample_rows.append(WearableSampleOut.model_validate(row))

    return WearableSyncResult(
        device=WearableDeviceOut.model_validate(device),
        synced_count=synced_count,
        failed_count=failed_count,
        samples=sample_rows,
    )