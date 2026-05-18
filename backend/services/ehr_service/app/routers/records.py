from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from ..deps import DbSession, get_current_principal
from ..schemas.record import ConsentCreate, ConsentOut, PatientBundleOut, VitalCreate, VitalOut, VitalTimelineOut
from ..services import create_consent, delete_consent, get_patient_bundle, list_vitals, record_vital

router = APIRouter(prefix="/v1/patients", tags=["Records"])


@router.get("/{patient_id}/records", response_model=PatientBundleOut)
async def read_bundle(patient_id: UUID, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    return await get_patient_bundle(db, principal, patient_id)


@router.post("/{patient_id}/vitals", response_model=VitalOut, status_code=status.HTTP_201_CREATED)
async def write_vital(patient_id: UUID, payload: VitalCreate, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    return await record_vital(db, principal, patient_id, payload)


@router.get("/{patient_id}/vitals", response_model=VitalTimelineOut)
async def read_vitals(
    patient_id: UUID,
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
):
    vitals = await list_vitals(db, principal, patient_id, from_date=from_date, to_date=to_date)
    return {"items": [VitalOut.model_validate(vital) for vital in vitals]}


@router.post("/{patient_id}/consents", response_model=ConsentOut, status_code=status.HTTP_201_CREATED)
async def grant_consent(patient_id: UUID, payload: ConsentCreate, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    return await create_consent(db, principal, patient_id, payload)


@router.delete("/{patient_id}/consents/{consent_id}", response_model=ConsentOut)
async def revoke_consent(patient_id: UUID, consent_id: UUID, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    return await delete_consent(db, principal, patient_id, consent_id)