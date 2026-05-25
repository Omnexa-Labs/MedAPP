from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import DbSession, require_roles
from ..models.core import Drug
from ..schemas.drugs import (
    DrugCreate,
    DrugList,
    DrugOut,
    DrugUpdate,
    DrugWithStock,
    ExpiringBatchList,
    StockAlertList,
)
from ..services import inventory_service

router = APIRouter(prefix="/v1/drugs", tags=["drugs"])

ALL = ("pharmacy_admin", "pharmacist", "cashier")
EDIT = ("pharmacy_admin", "pharmacist")


@router.get("", response_model=DrugList)
async def list_drugs(
    search: str | None = Query(default=None, max_length=128),
    category: str | None = Query(default=None, max_length=64),
    low_stock_only: bool = Query(default=False),
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*ALL)),
):
    stmt = select(Drug).where(Drug.is_active.is_(True))
    if search:
        like = f"%{search}%"
        stmt = stmt.where(or_(Drug.name.ilike(like), Drug.brand_name.ilike(like), Drug.sku.ilike(like)))
    if category:
        stmt = stmt.where(Drug.category == category)
    stmt = stmt.order_by(Drug.name)
    rows = list((await db.execute(stmt)).scalars().all())

    stock = await inventory_service.stock_map([d.id for d in rows], db)
    items = []
    for d in rows:
        qty = stock.get(d.id, 0)
        if low_stock_only and qty > d.reorder_level:
            continue
        items.append(
            DrugWithStock(
                **DrugOut.model_validate(d).model_dump(),
                quantity_on_hand=qty,
                is_low_stock=qty <= d.reorder_level,
            )
        )
    return DrugList(items=items)


@router.post("", response_model=DrugOut, status_code=status.HTTP_201_CREATED)
async def create_drug(
    body: DrugCreate,
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*EDIT)),
):
    d = Drug(**body.model_dump())
    db.add(d)
    await db.flush()
    return DrugOut.model_validate(d)


@router.get("/stock-alerts", response_model=StockAlertList)
async def stock_alerts(
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*ALL)),
):
    alerts = await inventory_service.low_stock_alerts(db)
    return StockAlertList(items=alerts)


@router.get("/expiring-soon", response_model=ExpiringBatchList)
async def expiring_soon(
    days: int = Query(default=90, ge=1, le=365),
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*ALL)),
):
    batches = await inventory_service.expiring_soon(db, days=days)
    return ExpiringBatchList(items=batches)


@router.get("/{drug_id}", response_model=DrugWithStock)
async def get_drug(
    drug_id: UUID,
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*ALL)),
):
    d = (await db.execute(select(Drug).where(Drug.id == drug_id))).scalar_one_or_none()
    if d is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "drug not found")
    qty = await inventory_service.current_stock(drug_id, db)
    return DrugWithStock(
        **DrugOut.model_validate(d).model_dump(),
        quantity_on_hand=qty,
        is_low_stock=qty <= d.reorder_level,
    )


@router.patch("/{drug_id}", response_model=DrugOut)
async def update_drug(
    drug_id: UUID,
    body: DrugUpdate,
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*EDIT)),
):
    d = (await db.execute(select(Drug).where(Drug.id == drug_id))).scalar_one_or_none()
    if d is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "drug not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(d, field, value)
    await db.flush()
    return DrugOut.model_validate(d)
