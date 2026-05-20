from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import HmsPrincipal, get_hms_principal, get_tenant_db, require_hms_roles
from ..schemas.patient import (
    PatientCreate,
    PatientList,
    PatientOut,
    PatientUpdate,
    VisitCreate,
    VisitList,
    VisitOut,
    VisitUpdate,
)
from ..services import patient_service

router = APIRouter(prefix="/v1", tags=["patients"])

PATIENT_ROLES = ("hospital_admin", "receptionist", "doctor", "nurse")


@router.post("/patients", response_model=PatientOut, status_code=status.HTTP_201_CREATED)
async def register_patient(
    body: PatientCreate,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*PATIENT_ROLES)),
):
    patient = await patient_service.create_patient(body, db)
    return patient


@router.get("/patients", response_model=PatientList)
async def list_patients(
    search: str | None = Query(default=None, max_length=128),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*PATIENT_ROLES)),
):
    patients, total = await patient_service.list_patients(db, search, limit, offset)
    return PatientList(items=patients, total=total)


@router.get("/patients/{patient_id}", response_model=PatientOut)
async def get_patient(
    patient_id: UUID,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*PATIENT_ROLES)),
):
    patient = await patient_service.get_patient(patient_id, db)
    if patient is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "patient not found")
    return patient


@router.patch("/patients/{patient_id}", response_model=PatientOut)
async def update_patient(
    patient_id: UUID,
    body: PatientUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*PATIENT_ROLES)),
):
    patient = await patient_service.update_patient(patient_id, body, db)
    if patient is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "patient not found")
    return patient


@router.post("/patients/{patient_id}/visits", response_model=VisitOut, status_code=status.HTTP_201_CREATED)
async def create_visit(
    patient_id: UUID,
    body: VisitCreate,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*PATIENT_ROLES)),
):
    patient = await patient_service.get_patient(patient_id, db)
    if patient is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "patient not found")
    visit = await patient_service.create_visit(patient_id, body, db)
    return visit


@router.get("/patients/{patient_id}/visits", response_model=VisitList)
async def list_visits(
    patient_id: UUID,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*PATIENT_ROLES)),
):
    visits = await patient_service.list_visits(patient_id, db)
    return VisitList(items=visits)


@router.get("/visits/{visit_id}", response_model=VisitOut)
async def get_visit(
    visit_id: UUID,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*PATIENT_ROLES)),
):
    visit = await patient_service.get_visit(visit_id, db)
    if visit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "visit not found")
    return visit


@router.patch("/visits/{visit_id}", response_model=VisitOut)
async def update_visit(
    visit_id: UUID,
    body: VisitUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles("hospital_admin", "doctor", "nurse")),
):
    visit = await patient_service.update_visit(visit_id, body, db)
    if visit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "visit not found")
    return visit
