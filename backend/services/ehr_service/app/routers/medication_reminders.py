from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from ..config import settings
from ..deps import CurrentPrincipalDep, DbSession
from ..models.medication import MedicationReminderAttempt as Attempt
from ..models.medication import MedicationReminderDevice as Device
from ..schemas.prescription import StrictModel
from ..services import medications as service
from .prescriptions import private_response

router = APIRouter(
    prefix="/v1/patients/{patient_id}/medications", dependencies=[Depends(private_response)]
)


class DeviceIn(StrictModel):
    push_token: str = Field(
        pattern=r"^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$", max_length=255
    )
    binding_id: UUID


class DeviceOut(StrictModel):
    patient_user_id: UUID
    binding_id: UUID
    enabled: bool
    expires_at: datetime


@router.get("/reminder-capability")
async def capability(patient_id: UUID, db=DbSession, principal=CurrentPrincipalDep):
    await service.owner(db, principal, patient_id)
    return {"push_available": settings.medication_push_enabled}


@router.post("/reminder-devices", response_model=DeviceOut)
async def register(
    patient_id: UUID, payload: DeviceIn, db=DbSession, principal=CurrentPrincipalDep
):
    patient = await service.owner(db, principal, patient_id)
    if not settings.medication_push_enabled:
        raise HTTPException(503, "medication push delivery has not been configured")
    moment = service.now()
    count = await db.scalar(
        select(func.count(Device.id)).where(
            Device.patient_id == patient.id,
            Device.enabled.is_(True),
            Device.expires_at > moment,
            Device.push_token != payload.push_token,
        )
    )
    if count >= 5:
        raise HTTPException(409, "five reminder devices are already active for this account")
    # Token uniqueness binds this installation to its most recently registered account.
    # An old account's delayed disable cannot revoke the new binding.
    insert = sqlite_insert if db.bind.dialect.name == "sqlite" else pg_insert
    values = dict(
        patient_id=patient.id,
        push_token=payload.push_token,
        binding_id=payload.binding_id,
        enabled=True,
        expires_at=moment + timedelta(days=7),
        updated_at=moment,
    )
    await db.execute(
        insert(Device)
        .values(**values)
        .on_conflict_do_update(
            index_elements=[Device.push_token],
            set_=values,
        )
    )
    await service.record_access(
        db, patient_id, patient.id, "medication_device_register", str(payload.binding_id)
    )
    return DeviceOut(
        patient_user_id=patient_id,
        binding_id=payload.binding_id,
        enabled=True,
        expires_at=values["expires_at"],
    )


@router.post("/reminder-devices/{binding_id}/disable")
async def disable(patient_id: UUID, binding_id: UUID, db=DbSession, principal=CurrentPrincipalDep):
    patient = await service.owner(db, principal, patient_id)
    devices = list(
        await db.scalars(
            select(Device)
            .where(
                Device.patient_id == patient.id,
                Device.binding_id == binding_id,
            )
            .with_for_update()
        )
    )
    for device in devices:
        device.enabled = False
    await service.record_access(
        db, patient_id, patient.id, "medication_device_disable", str(binding_id)
    )
    return {"disabled": True}


@router.get("/{course_id}/reminder-history")
async def history(
    patient_id: UUID,
    course_id: UUID,
    limit: int = Query(25, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db=DbSession,
    principal=CurrentPrincipalDep,
):
    patient = await service.owner(db, principal, patient_id)
    await service.load(db, patient, course_id)
    rows = list(
        await db.scalars(
            select(Attempt)
            .where(Attempt.course_id == course_id)
            .order_by(Attempt.created_at.desc(), Attempt.id.desc())
            .offset(offset)
            .limit(limit + 1)
        )
    )
    await service.record_access(
        db, patient_id, patient.id, "medication_reminder_history", str(course_id)
    )
    return {
        "items": [
            {
                "id": row.id,
                "scheduled_at": service.aware(row.scheduled_at),
                "state": row.state,
                "error_code": row.error_code,
            }
            for row in rows[:limit]
        ],
        "offset": offset,
        "limit": limit,
        "next_offset": offset + limit if len(rows) > limit else None,
    }
