from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from .. import events
from ..deps import DbSession, get_current_principal
from ..schemas.record import ConsentCreate, ConsentOut, ConsentPage, PatientBundleOut, PatientSummaryOut, VitalCreate, VitalOut, VitalTimelineOut
from ..services.clinician_identity import ClinicianLookup, get_clinician_lookup
from ..services.record_service import list_consents
from ..services.vital_timeline import list_vital_page
from ..services import create_consent, delete_consent, get_patient_bundle, get_patient_summary, list_vitals, record_vital

router = APIRouter(prefix="/v1/patients", tags=["Records"])


@router.get("/{patient_id}/records", response_model=PatientBundleOut)
async def read_bundle(patient_id: UUID, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    return await get_patient_bundle(db, principal, patient_id)


@router.get("/{patient_id}/summary", response_model=PatientSummaryOut)
async def read_summary(patient_id: UUID, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    return await get_patient_summary(db, principal, patient_id)


@router.post("/{patient_id}/vitals", response_model=VitalOut, status_code=status.HTTP_201_CREATED)
async def write_vital(
    patient_id: UUID,
    payload: VitalCreate,
    request: Request,
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
):
    vital = await record_vital(db, principal, patient_id, payload)
    await db.commit()
    # Publish after the write returns — by the time downstream consumers
    # query EHR, the row is durable. Best-effort; broker hiccups never
    # turn a 201 into a 5xx.
    await events.publish(
        request.app,
        event_type="ehr.vital.recorded",
        subject=str(patient_id),
        data={
            "patient_id": str(patient_id),
            "vital_id": str(vital.vital_id),
            "kind": vital.kind,
            "value": vital.value,
            "unit": vital.unit,
            "recorded_at": vital.recorded_at.isoformat(),
        },
    )
    return vital


@router.get("/{patient_id}/vitals", response_model=VitalTimelineOut)
async def read_vitals(
    patient_id: UUID,
    response: Response,
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=100),
    cursor: str | None = Query(default=None, max_length=256),
    kind: str | None = Query(default=None, min_length=1, max_length=64),
):
    response.headers["Cache-Control"] = "no-store"
    if limit is not None:
        return await list_vital_page(db, principal, patient_id, limit=limit, cursor=cursor,
                                     kind=kind, from_date=from_date, to_date=to_date)
    if cursor or kind:
        raise HTTPException(422, "limit is required when filtering by kind or using a cursor")
    vitals = await list_vitals(db, principal, patient_id, from_date=from_date, to_date=to_date)
    return {"items": [VitalOut.model_validate(vital) for vital in vitals]}


@router.post("/{patient_id}/consents", response_model=ConsentOut, status_code=status.HTTP_201_CREATED)
async def grant_consent(patient_id: UUID, payload: ConsentCreate, response: Response,
                        db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal),
                        lookup: ClinicianLookup = Depends(get_clinician_lookup)):
    response.headers["Cache-Control"] = "no-store"
    return await create_consent(db, principal, patient_id, payload, lookup=lookup)


@router.get("/{patient_id}/consents", response_model=ConsentPage)
async def read_consents(patient_id: UUID, response: Response, db: AsyncSession = DbSession,
                        principal: Principal = Depends(get_current_principal),
                        include_inactive: bool = False, limit: int = Query(25, ge=1, le=100),
                        offset: int = Query(0, ge=0), clinician_user_id: UUID | None = None):
    response.headers["Cache-Control"] = "no-store"
    return await list_consents(db, principal, patient_id, include_inactive=include_inactive, limit=limit, offset=offset, clinician_user_id=clinician_user_id)


@router.delete("/{patient_id}/consents/{consent_id}", response_model=ConsentOut)
async def revoke_consent(patient_id: UUID, consent_id: UUID, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    return await delete_consent(db, principal, patient_id, consent_id)
