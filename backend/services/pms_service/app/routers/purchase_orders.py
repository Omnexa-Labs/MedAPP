from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import CurrentPrincipal, DbSession, PmsPrincipal, require_roles
from ..models.core import PurchaseOrder
from ..schemas.purchase_orders import (
    PurchaseOrderCreate,
    PurchaseOrderItemOut,
    PurchaseOrderList,
    PurchaseOrderOut,
    ReceiveGoodsRequest,
)
from ..services import purchase_order_service

router = APIRouter(prefix="/v1/purchase-orders", tags=["purchase-orders"])

ALL = ("pharmacy_admin", "pharmacist", "cashier")
EDIT = ("pharmacy_admin", "pharmacist")


def _to_out(po: PurchaseOrder, items) -> PurchaseOrderOut:
    return PurchaseOrderOut(
        id=po.id,
        po_number=po.po_number,
        supplier_id=po.supplier_id,
        status=po.status,
        expected_at=po.expected_at,
        total_cents=po.total_cents,
        currency=po.currency,
        notes=po.notes,
        created_at=po.created_at,
        items=[PurchaseOrderItemOut.model_validate(i) for i in items],
    )


@router.get("", response_model=PurchaseOrderList)
async def list_pos(
    po_status: str | None = Query(default=None, alias="status"),
    db = DbSession,
    _=Depends(require_roles(*ALL)),
):
    stmt = select(PurchaseOrder).order_by(PurchaseOrder.created_at.desc())
    if po_status:
        stmt = stmt.where(PurchaseOrder.status == po_status)
    rows = list((await db.execute(stmt)).scalars().all())
    out = []
    for po in rows:
        items = await purchase_order_service.get_po_items(po.id, db)
        out.append(_to_out(po, items))
    return PurchaseOrderList(items=out)


@router.post("", response_model=PurchaseOrderOut, status_code=status.HTTP_201_CREATED)
async def create_po(
    body: PurchaseOrderCreate,
    db = DbSession,
    principal: PmsPrincipal = CurrentPrincipal,
    _=Depends(require_roles(*EDIT)),
):
    if not body.items:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "PO must have at least one item")
    actor_id = UUID(principal.subject) if principal.subject else None
    po = await purchase_order_service.create_po(body, actor_id, db)
    items = await purchase_order_service.get_po_items(po.id, db)
    return _to_out(po, items)


@router.get("/{po_id}", response_model=PurchaseOrderOut)
async def get_po(po_id: UUID, db = DbSession, _=Depends(require_roles(*ALL))):
    po = await purchase_order_service.get_po(po_id, db)
    if po is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "PO not found")
    items = await purchase_order_service.get_po_items(po.id, db)
    return _to_out(po, items)


@router.post("/{po_id}/send", response_model=PurchaseOrderOut)
async def send_po(po_id: UUID, db = DbSession, _=Depends(require_roles(*EDIT))):
    try:
        po = await purchase_order_service.transition_status(po_id, "sent", db)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    items = await purchase_order_service.get_po_items(po.id, db)
    return _to_out(po, items)


@router.post("/{po_id}/cancel", response_model=PurchaseOrderOut)
async def cancel_po(po_id: UUID, db = DbSession, _=Depends(require_roles(*EDIT))):
    try:
        po = await purchase_order_service.transition_status(po_id, "cancelled", db)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    items = await purchase_order_service.get_po_items(po.id, db)
    return _to_out(po, items)


@router.post("/{po_id}/receive", response_model=PurchaseOrderOut)
async def receive_goods(
    po_id: UUID,
    body: ReceiveGoodsRequest,
    db = DbSession,
    principal: PmsPrincipal = CurrentPrincipal,
    _=Depends(require_roles(*EDIT)),
):
    actor_id = UUID(principal.subject) if principal.subject else None
    try:
        await purchase_order_service.receive_goods(po_id, body, actor_id, db)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    po = await purchase_order_service.get_po(po_id, db)
    items = await purchase_order_service.get_po_items(po.id, db)
    return _to_out(po, items)
