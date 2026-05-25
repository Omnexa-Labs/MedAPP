from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import DbSession, require_roles
from ..models.core import Drug, DrugBatch
from ..schemas.batches import BatchCreate, BatchList, BatchOut, StockAdjustment
from ..services import inventory_service

router = APIRouter(prefix="/v1/batches", tags=["batches"])

ALL = ("pharmacy_admin", "pharmacist", "cashier")
EDIT = ("pharmacy_admin", "pharmacist")


@router.get("", response_model=BatchList)
async def list_batches(
    drug_id: UUID | None = Query(default=None),
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*ALL)),
):
    stmt = select(DrugBatch).order_by(DrugBatch.expiry_date.asc())
    if drug_id is not None:
        stmt = stmt.where(DrugBatch.drug_id == drug_id)
    rows = list((await db.execute(stmt)).scalars().all())
    return BatchList(items=[BatchOut.model_validate(b) for b in rows])


@router.post("", response_model=BatchOut, status_code=status.HTTP_201_CREATED)
async def create_batch(
    body: BatchCreate,
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*EDIT)),
):
    drug = (
        await db.execute(select(Drug).where(Drug.id == body.drug_id))
    ).scalar_one_or_none()
    if drug is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "drug not found")

    batch = DrugBatch(
        drug_id=body.drug_id,
        supplier_id=body.supplier_id,
        batch_number=body.batch_number,
        quantity_received=body.quantity_received,
        quantity_on_hand=body.quantity_received,
        unit_cost_cents=body.unit_cost_cents,
        selling_price_cents=body.selling_price_cents or drug.default_selling_price_cents,
        currency=body.currency,
        received_at=body.received_at,
        expiry_date=body.expiry_date,
    )
    db.add(batch)
    await db.flush()
    inventory_service.record_movement(
        db,
        drug_id=body.drug_id,
        batch_id=batch.id,
        delta=body.quantity_received,
        reason="receive",
        ref_type="batch",
        ref_id=batch.id,
        note="manual batch entry",
    )
    await db.flush()
    return BatchOut.model_validate(batch)


@router.post("/{batch_id}/adjust", response_model=BatchOut)
async def adjust_batch(
    batch_id: UUID,
    body: StockAdjustment,
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*EDIT)),
):
    batch = (
        await db.execute(select(DrugBatch).where(DrugBatch.id == batch_id))
    ).scalar_one_or_none()
    if batch is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "batch not found")
    new_qty = batch.quantity_on_hand + body.delta
    if new_qty < 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "adjustment would go negative")
    batch.quantity_on_hand = new_qty
    inventory_service.record_movement(
        db,
        drug_id=batch.drug_id,
        batch_id=batch.id,
        delta=body.delta,
        reason=body.reason or "adjust",
        ref_type="adjustment",
        ref_id=batch.id,
        note=body.note,
    )
    await db.flush()
    return BatchOut.model_validate(batch)
