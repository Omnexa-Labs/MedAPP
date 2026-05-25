from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import CurrentPrincipal, DbSession, PmsPrincipal, require_roles
from ..models.core import Sale, SaleItem
from ..schemas.sales import SaleItemOut, SaleList, SaleOut, WalkInSaleCreate
from ..services import pos_service

router = APIRouter(prefix="/v1/sales", tags=["sales"])

ALL = ("pharmacy_admin", "pharmacist", "cashier")
EDIT = ("pharmacy_admin", "pharmacist", "cashier")
VOID = ("pharmacy_admin", "pharmacist")


async def _to_out(sale: Sale, db: AsyncSession) -> SaleOut:
    items = (
        await db.execute(select(SaleItem).where(SaleItem.sale_id == sale.id))
    ).scalars().all()
    return SaleOut(
        id=sale.id,
        sale_number=sale.sale_number,
        prescription_id=sale.prescription_id,
        customer_id=sale.customer_id,
        cashier_staff_id=sale.cashier_staff_id,
        subtotal_cents=sale.subtotal_cents,
        discount_cents=sale.discount_cents,
        tax_cents=sale.tax_cents,
        total_cents=sale.total_cents,
        currency=sale.currency,
        payment_method=sale.payment_method,
        payment_ref=sale.payment_ref,
        status=sale.status,
        completed_at=sale.completed_at,
        created_at=sale.created_at,
        items=[SaleItemOut.model_validate(i) for i in items],
    )


@router.get("", response_model=SaleList)
async def list_sales(
    sale_status: str | None = Query(default=None, alias="status"),
    payment_method: str | None = Query(default=None),
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*ALL)),
):
    stmt = select(Sale).order_by(Sale.created_at.desc())
    if sale_status:
        stmt = stmt.where(Sale.status == sale_status)
    if payment_method:
        stmt = stmt.where(Sale.payment_method == payment_method)
    rows = list((await db.execute(stmt)).scalars().all())
    return SaleList(items=[await _to_out(s, db) for s in rows])


@router.post("", response_model=SaleOut, status_code=status.HTTP_201_CREATED)
async def create_walk_in_sale(
    body: WalkInSaleCreate,
    db: AsyncSession = DbSession,
    principal: PmsPrincipal = CurrentPrincipal,
    _=Depends(require_roles(*EDIT)),
):
    actor_id = UUID(principal.subject) if principal.subject else None
    try:
        sale = await pos_service.record_walk_in_sale(body, actor_id, db)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    return await _to_out(sale, db)


@router.get("/{sale_id}", response_model=SaleOut)
async def get_sale(
    sale_id: UUID,
    db: AsyncSession = DbSession,
    _=Depends(require_roles(*ALL)),
):
    sale = (
        await db.execute(select(Sale).where(Sale.id == sale_id))
    ).scalar_one_or_none()
    if sale is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "sale not found")
    return await _to_out(sale, db)


@router.post("/{sale_id}/void", response_model=SaleOut)
async def void_sale(
    sale_id: UUID,
    db: AsyncSession = DbSession,
    principal: PmsPrincipal = CurrentPrincipal,
    _=Depends(require_roles(*VOID)),
):
    actor_id = UUID(principal.subject) if principal.subject else None
    try:
        sale = await pos_service.void_sale(sale_id, actor_id, db)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    return await _to_out(sale, db)
