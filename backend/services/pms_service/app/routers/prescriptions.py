from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import CurrentPrincipal, DbSession, PmsPrincipal, require_roles
from ..models.core import Drug, Prescription, PrescriptionItem
from ..schemas.prescriptions import (
    DispenseRequest,
    DispenseResult,
    PrescriptionCreate,
    PrescriptionItemOut,
    PrescriptionList,
    PrescriptionOut,
)
from ..services import dispensing_service

router = APIRouter(prefix="/v1/prescriptions", tags=["prescriptions"])

ALL = ("pharmacy_admin", "pharmacist", "cashier")
EDIT = ("pharmacy_admin", "pharmacist")


async def _next_rx_number(db: AsyncSession) -> str:
    n = (await db.execute(select(func.count(Prescription.id)))).scalar_one()
    return f"RX-{int(n) + 1:06d}"


async def _to_out(rx: Prescription, db: AsyncSession) -> PrescriptionOut:
    items = (
        await db.execute(
            select(PrescriptionItem).where(PrescriptionItem.prescription_id == rx.id)
        )
    ).scalars().all()
    return PrescriptionOut(
        id=rx.id,
        rx_number=rx.rx_number,
        source=rx.source,
        external_ref=rx.external_ref,
        customer_id=rx.customer_id,
        prescriber_name=rx.prescriber_name,
        prescriber_license=rx.prescriber_license,
        status=rx.status,
        notes=rx.notes,
        created_at=rx.created_at,
        items=[PrescriptionItemOut.model_validate(i) for i in items],
    )


@router.get("", response_model=PrescriptionList)
async def list_prescriptions(
    rx_status: str | None = Query(default=None, alias="status"),
    source: str | None = Query(default=None),
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*ALL)),
):
    stmt = select(Prescription).order_by(Prescription.created_at.desc())
    if rx_status:
        stmt = stmt.where(Prescription.status == rx_status)
    if source:
        stmt = stmt.where(Prescription.source == source)
    rows = list((await db.execute(stmt)).scalars().all())
    return PrescriptionList(items=[await _to_out(rx, db) for rx in rows])


@router.post("", response_model=PrescriptionOut, status_code=status.HTTP_201_CREATED)
async def create_prescription(
    body: PrescriptionCreate,
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*EDIT)),
):
    if not body.items:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "prescription must have items")
    rx = Prescription(
        rx_number=await _next_rx_number(db),
        source=body.source,
        customer_id=body.customer_id,
        prescriber_name=body.prescriber_name,
        prescriber_license=body.prescriber_license,
        status="pending",
        notes=body.notes,
    )
    db.add(rx)
    await db.flush()
    for item in body.items:
        drug = (await db.execute(select(Drug).where(Drug.id == item.drug_id))).scalar_one_or_none()
        if drug is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"drug {item.drug_id} not found")
        db.add(PrescriptionItem(
            prescription_id=rx.id,
            drug_id=item.drug_id,
            drug_name_snapshot=drug.name,
            quantity_prescribed=item.quantity_prescribed,
            dosage_instructions=item.dosage_instructions,
        ))
    await db.flush()
    return await _to_out(rx, db)


@router.get("/{rx_id}", response_model=PrescriptionOut)
async def get_prescription(
    rx_id: UUID,
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*ALL)),
):
    rx = (await db.execute(select(Prescription).where(Prescription.id == rx_id))).scalar_one_or_none()
    if rx is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "prescription not found")
    return await _to_out(rx, db)


@router.post("/{rx_id}/dispense", response_model=DispenseResult)
async def dispense(
    rx_id: UUID,
    body: DispenseRequest,
    db: AsyncSession = DbSession,
    principal: PmsPrincipal = CurrentPrincipal,
    _=Depends(require_roles(*EDIT)),
):
    actor_id = UUID(principal.subject) if principal.subject else None
    try:
        result = await dispensing_service.dispense(rx_id, body, actor_id, db)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    return DispenseResult(**result)


@router.post("/{rx_id}/cancel", response_model=PrescriptionOut)
async def cancel_prescription(
    rx_id: UUID,
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*EDIT)),
):
    rx = (await db.execute(select(Prescription).where(Prescription.id == rx_id))).scalar_one_or_none()
    if rx is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "prescription not found")
    if rx.status == "dispensed":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "already fully dispensed")
    rx.status = "cancelled"
    await db.flush()
    return await _to_out(rx, db)
