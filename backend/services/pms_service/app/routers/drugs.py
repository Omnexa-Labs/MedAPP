from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError

from ..deps import DbSession, require_roles
from ..models.core import AuditLog, Drug, DrugBatch
from ..schemas.drugs import (
    DrugCreate,
    DrugList,
    DrugOut,
    DrugUpdate,
    DrugWithStock,
    ExpiringBatchList,
    StockAlertList,
)
from ..services import inventory_requests as requests
from ..services import inventory_service as inventory

router = APIRouter(prefix="/v1/drugs", tags=["drugs"])
ALL = ("pharmacy_admin", "pharmacist", "cashier")
EDIT = ("pharmacy_admin", "pharmacist")


@router.get("", response_model=DrugList)
async def list_drugs(
    search: str | None = Query(None, max_length=128),
    category: str | None = Query(None, max_length=64),
    low_stock_only: bool = False,
    active: bool = True,
    limit: int = Query(200, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db=DbSession,
    _=Depends(require_roles(*ALL)),
):
    stock = (
        select(DrugBatch.drug_id, func.sum(DrugBatch.quantity_on_hand).label("qty"))
        .where(DrugBatch.expiry_date >= date.today())
        .group_by(DrugBatch.drug_id)
        .subquery()
    )
    qty = func.coalesce(stock.c.qty, 0)
    stmt = (
        select(Drug, qty)
        .outerjoin(stock, stock.c.drug_id == Drug.id)
        .where(Drug.is_active == active)
    )
    if search:
        like = (
            "%" + search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        )
        stmt = stmt.where(
            or_(
                *(
                    field.ilike(like, escape="\\")
                    for field in (Drug.name, Drug.brand_name, Drug.sku)
                )
            )
        )
    if category:
        stmt = stmt.where(Drug.category == category)
    if low_stock_only:
        stmt = stmt.where(qty <= Drug.reorder_level)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (await db.execute(stmt.order_by(Drug.name, Drug.id).offset(offset).limit(limit))).all()
    return DrugList(
        items=[
            DrugWithStock(
                **DrugOut.model_validate(drug).model_dump(),
                quantity_on_hand=int(count),
                is_low_stock=count <= drug.reorder_level,
            )
            for drug, count in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
        currency=await inventory.pharmacy_currency(db),
    )


@router.post("", response_model=DrugOut, status_code=201)
async def create_drug(
    body: DrugCreate,
    idempotency_key: UUID = Header(),
    db=DbSession,
    principal=Depends(require_roles(*EDIT)),
):
    actor_id = UUID(principal.subject)
    previous = await requests.begin_request(
        db, idempotency_key, actor_id, "drug.create", body.model_dump(mode="json")
    )
    if previous is not None:
        return previous
    values = body.model_dump()
    currency = await inventory.pharmacy_currency(db)
    if values["currency"] is not None and values["currency"] != currency:
        raise HTTPException(422, "Use the pharmacy currency: " + currency)
    values["currency"] = currency
    drug = Drug(**values)
    db.add(drug)
    try:
        await db.flush()
    except IntegrityError:
        raise HTTPException(
            409, "This SKU is already in the catalog. Search for the existing drug."
        ) from None
    db.add(
        AuditLog(
            actor_staff_id=actor_id, action="drug.created", entity_type="drug", entity_id=drug.id
        )
    )
    return await requests.finish_request(db, idempotency_key, DrugOut.model_validate(drug))


@router.get("/stock-alerts", response_model=StockAlertList)
async def stock_alerts(db=DbSession, _=Depends(require_roles(*ALL))):
    return StockAlertList(items=await inventory.low_stock_alerts(db))


@router.get("/expiring-soon", response_model=ExpiringBatchList)
async def expiring_soon(
    days: int = Query(90, ge=1, le=365), db=DbSession, _=Depends(require_roles(*ALL))
):
    return ExpiringBatchList(items=await inventory.expiring_soon(db, days))


@router.get("/{drug_id}", response_model=DrugWithStock)
async def get_drug(drug_id: UUID, db=DbSession, _=Depends(require_roles(*ALL))):
    drug = await db.get(Drug, drug_id)
    if drug is None:
        raise HTTPException(404, "Drug not found.")
    qty = await inventory.current_stock(drug_id, db)
    return DrugWithStock(
        **DrugOut.model_validate(drug).model_dump(),
        quantity_on_hand=qty,
        is_low_stock=qty <= drug.reorder_level,
    )


@router.patch("/{drug_id}", response_model=DrugOut)
async def update_drug(
    drug_id: UUID, body: DrugUpdate, db=DbSession, principal=Depends(require_roles(*EDIT))
):
    drug = (await inventory.lock_drugs(db, [drug_id])).get(drug_id)
    if drug is None:
        raise HTTPException(404, "Drug not found.")
    if drug.version != body.version:
        raise HTTPException(409, "This drug changed. Reload before saving your edits.")
    values = body.model_dump(exclude_unset=True, exclude={"version"})
    before = DrugOut.model_validate(drug).model_dump(mode="json")
    for field, value in values.items():
        setattr(drug, field, value or None if field in {"sku", "brand_name", "notes"} else value)
    if any(before[field] != getattr(drug, field) for field in values):
        drug.version += 1
        db.add(
            AuditLog(
                actor_staff_id=UUID(principal.subject),
                action="drug.updated",
                entity_type="drug",
                entity_id=drug.id,
                payload_json={
                    "version": drug.version,
                    "before": {key: before[key] for key in values},
                    "after": values,
                },
            )
        )
    try:
        await db.flush()
    except IntegrityError:
        raise HTTPException(409, "This SKU is already in the catalog.") from None
    result = DrugOut.model_validate(drug)
    await db.commit()
    return result
