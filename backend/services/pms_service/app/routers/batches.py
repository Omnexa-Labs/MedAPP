from datetime import date, timedelta
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import func, select

from ..deps import DbSession, require_roles
from ..models.core import Drug, DrugBatch, Staff, StockMovement, Supplier
from ..schemas.batches import BatchCreate, BatchList, BatchOut, MovementList, StockAdjustment
from ..services import inventory_requests as requests
from ..services import inventory_service as inventory

router = APIRouter(prefix="/v1/batches", tags=["batches"])
ALL = ("pharmacy_admin", "pharmacist", "cashier")
EDIT = ("pharmacy_admin", "pharmacist")


@router.get("", response_model=BatchList)
async def list_batches(
    drug_id: UUID | None = None,
    purchase_order_id: UUID | None = None,
    state: Literal["all", "available", "expiring", "expired", "empty"] = "all",
    limit: int = Query(200, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db=DbSession,
    _=Depends(require_roles(*ALL)),
):
    stmt = select(DrugBatch, Drug.name).join(Drug, Drug.id == DrugBatch.drug_id)
    if drug_id:
        stmt = stmt.where(DrugBatch.drug_id == drug_id)
    if purchase_order_id:
        stmt = stmt.where(DrugBatch.purchase_order_id == purchase_order_id)
    today = date.today()
    if state == "empty":
        stmt = stmt.where(DrugBatch.quantity_on_hand == 0)
    elif state != "all":
        stmt = stmt.where(DrugBatch.quantity_on_hand > 0)
        if state == "expired":
            stmt = stmt.where(DrugBatch.expiry_date < today)
        else:
            stmt = stmt.where(DrugBatch.expiry_date >= today)
            if state == "expiring":
                stmt = stmt.where(DrugBatch.expiry_date <= today + timedelta(days=90))
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (
        await db.execute(
            stmt.order_by(DrugBatch.expiry_date, DrugBatch.id).offset(offset).limit(limit)
        )
    ).all()
    return BatchList(
        items=[
            BatchOut(
                **BatchOut.model_validate(batch).model_dump(exclude={"drug_name"}), drug_name=name
            )
            for batch, name in rows
        ],
        inventory_date=today,
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post("", response_model=BatchOut, status_code=201)
async def create_batch(
    body: BatchCreate,
    idempotency_key: UUID = Header(),
    db=DbSession,
    principal=Depends(require_roles(*EDIT)),
):
    actor_id = UUID(principal.subject)
    previous = await requests.begin_request(
        db, idempotency_key, actor_id, "batch.receive", body.model_dump(mode="json")
    )
    if previous is not None:
        return previous
    # Check today's constraints only for a new receipt. A committed receipt remains
    # replayable even if its batch has expired since the original request.
    if body.received_at > date.today() or body.expiry_date < date.today():
        raise HTTPException(
            422, "Received date cannot be in the future, and new stock cannot already be expired."
        )
    drug = (await inventory.lock_drugs(db, [body.drug_id])).get(body.drug_id)
    if drug is None or not drug.is_active:
        raise HTTPException(404, "Active drug not found.")
    if body.supplier_id:
        supplier = await db.get(Supplier, body.supplier_id)
        if supplier is None or not supplier.is_active:
            raise HTTPException(422, "Choose an active supplier.")
    if body.currency and body.currency != drug.currency:
        raise HTTPException(422, "Batch currency must match the drug.")
    if drug.currency != await inventory.pharmacy_currency(db):
        raise HTTPException(422, "The drug must use the pharmacy currency before receiving stock.")
    batch = DrugBatch(
        **body.model_dump(exclude={"selling_price_cents", "currency"}),
        quantity_on_hand=body.quantity_received,
        currency=drug.currency,
        selling_price_cents=body.selling_price_cents
        if body.selling_price_cents is not None
        else drug.default_selling_price_cents,
    )
    db.add(batch)
    await db.flush()
    inventory.record_movement(
        db,
        drug_id=drug.id,
        batch_id=batch.id,
        delta=body.quantity_received,
        reason="receive",
        ref_type="batch",
        ref_id=batch.id,
        actor_staff_id=actor_id,
        note="Manual stock receipt",
    )
    return await requests.finish_request(db, idempotency_key, BatchOut.model_validate(batch))


@router.post("/{batch_id}/adjust", response_model=BatchOut)
async def adjust_batch(
    batch_id: UUID,
    body: StockAdjustment,
    idempotency_key: UUID = Header(),
    db=DbSession,
    principal=Depends(require_roles(*EDIT)),
):
    actor_id = UUID(principal.subject)
    previous = await requests.begin_request(
        db, idempotency_key, actor_id, "batch.adjust:" + str(batch_id), body.model_dump(mode="json")
    )
    if previous is not None:
        return previous
    drug_id = await db.scalar(select(DrugBatch.drug_id).where(DrugBatch.id == batch_id))
    if drug_id is None:
        raise HTTPException(404, "Batch not found.")
    await inventory.lock_drugs(db, [drug_id])
    batch = await db.get(DrugBatch, batch_id, populate_existing=True)
    if batch.version != body.version:
        raise HTTPException(409, "This batch changed. Reload before adjusting stock.")
    inventory.change_quantity(batch, body.delta)
    inventory.record_movement(
        db,
        drug_id=batch.drug_id,
        batch_id=batch.id,
        delta=body.delta,
        reason=body.reason,
        ref_type="adjustment",
        ref_id=batch.id,
        actor_staff_id=actor_id,
        note=body.note,
    )
    await db.flush()
    return await requests.finish_request(db, idempotency_key, BatchOut.model_validate(batch))


@router.get("/{batch_id}/movements", response_model=MovementList)
async def movements(
    batch_id: UUID, offset: int = Query(0, ge=0), db=DbSession, _=Depends(require_roles(*EDIT))
):
    if await db.get(DrugBatch, batch_id) is None:
        raise HTTPException(404, "Batch not found.")
    rows = (
        await db.execute(
            select(StockMovement, Staff.full_name)
            .outerjoin(Staff, Staff.id == StockMovement.actor_staff_id)
            .where(StockMovement.batch_id == batch_id)
            .order_by(StockMovement.created_at.desc(), StockMovement.id.desc())
            .offset(offset)
            .limit(51)
        )
    ).all()
    return MovementList(
        items=[
            dict(
                id=m.id,
                delta=m.delta,
                reason=m.reason,
                note=m.note,
                actor_staff_id=m.actor_staff_id,
                actor_name=name,
                created_at=m.created_at,
            )
            for m, name in rows[:50]
        ],
        has_more=len(rows) > 50,
    )
