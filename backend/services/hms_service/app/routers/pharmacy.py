from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import HmsPrincipal, get_hms_principal, get_tenant_db, require_hms_roles
from ..schemas.pharmacy import (
    DispenseRequest,
    DrugBatchCreate,
    DrugBatchOut,
    DrugCreate,
    DrugList,
    DrugOut,
    DrugUpdate,
    PrescriptionCreate,
    PrescriptionList,
    PrescriptionOut,
    StockAlertList,
    StockAlertOut,
)
from ..services import pharmacy_service

router = APIRouter(prefix="/v1", tags=["pharmacy"])

PHARMACY_ROLES = ("hospital_admin", "pharmacist", "doctor")
PRESCRIBE_ROLES = ("hospital_admin", "doctor")


@router.post("/pharmacy/drugs", response_model=DrugOut, status_code=status.HTTP_201_CREATED)
async def create_drug(
    body: DrugCreate,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*PHARMACY_ROLES)),
):
    return await pharmacy_service.create_drug(body, db)


@router.get("/pharmacy/drugs", response_model=DrugList)
async def list_drugs(
    search: str | None = Query(default=None, max_length=128),
    category: str | None = Query(default=None, max_length=64),
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*PHARMACY_ROLES)),
):
    drugs = await pharmacy_service.list_drugs(db, search, category)
    return DrugList(items=drugs)


@router.patch("/pharmacy/drugs/{drug_id}", response_model=DrugOut)
async def update_drug(
    drug_id: UUID,
    body: DrugUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*PHARMACY_ROLES)),
):
    drug = await pharmacy_service.update_drug(drug_id, body, db)
    if drug is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "drug not found")
    return drug


@router.post("/pharmacy/drugs/{drug_id}/batches", response_model=DrugBatchOut, status_code=status.HTTP_201_CREATED)
async def add_batch(
    drug_id: UUID,
    body: DrugBatchCreate,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*PHARMACY_ROLES)),
):
    return await pharmacy_service.add_batch(drug_id, body, db)


@router.get("/pharmacy/stock-alerts", response_model=StockAlertList)
async def stock_alerts(
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*PHARMACY_ROLES)),
):
    alerts = await pharmacy_service.get_stock_alerts(db)
    return StockAlertList(items=[StockAlertOut(**a) for a in alerts])


@router.post("/prescriptions", response_model=PrescriptionOut, status_code=status.HTTP_201_CREATED)
async def create_prescription(
    body: PrescriptionCreate,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*PRESCRIBE_ROLES)),
):
    rx = await pharmacy_service.create_prescription(body, UUID(principal.subject), db)
    items = await pharmacy_service.get_prescription_items(rx.id, db)
    return PrescriptionOut(
        prescription_id=rx.id,
        visit_id=rx.visit_id,
        patient_id=rx.patient_id,
        prescribed_by_staff_id=rx.prescribed_by_staff_id,
        status=rx.status,
        notes=rx.notes,
        items=items,
        created_at=rx.created_at,
        updated_at=rx.updated_at,
    )


@router.get("/prescriptions", response_model=PrescriptionList)
async def list_prescriptions(
    patient_id: UUID | None = Query(default=None),
    rx_status: str | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*PHARMACY_ROLES)),
):
    prescriptions = await pharmacy_service.list_prescriptions(db, patient_id, rx_status)
    result = []
    for rx in prescriptions:
        items = await pharmacy_service.get_prescription_items(rx.id, db)
        result.append(PrescriptionOut(
            prescription_id=rx.id,
            visit_id=rx.visit_id,
            patient_id=rx.patient_id,
            prescribed_by_staff_id=rx.prescribed_by_staff_id,
            status=rx.status,
            notes=rx.notes,
            items=items,
            created_at=rx.created_at,
            updated_at=rx.updated_at,
        ))
    return PrescriptionList(items=result)


@router.get("/prescriptions/{rx_id}", response_model=PrescriptionOut)
async def get_prescription(
    rx_id: UUID,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*PHARMACY_ROLES)),
):
    rx = await pharmacy_service.get_prescription(rx_id, db)
    if rx is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "prescription not found")
    items = await pharmacy_service.get_prescription_items(rx_id, db)
    return PrescriptionOut(
        prescription_id=rx.id,
        visit_id=rx.visit_id,
        patient_id=rx.patient_id,
        prescribed_by_staff_id=rx.prescribed_by_staff_id,
        status=rx.status,
        notes=rx.notes,
        items=items,
        created_at=rx.created_at,
        updated_at=rx.updated_at,
    )


@router.post("/prescriptions/{rx_id}/dispense", status_code=status.HTTP_201_CREATED)
async def dispense(
    rx_id: UUID,
    body: DispenseRequest,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles("hospital_admin", "pharmacist")),
):
    try:
        dispensings = await pharmacy_service.dispense(rx_id, body, UUID(principal.subject), db)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return {"dispensed": len(dispensings)}
