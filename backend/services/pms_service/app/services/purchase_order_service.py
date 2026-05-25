from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.core import DrugBatch, PurchaseOrder, PurchaseOrderItem
from ..schemas.purchase_orders import (
    PurchaseOrderCreate,
    ReceiveGoodsRequest,
)
from . import inventory_service


async def _next_po_number(db: AsyncSession) -> str:
    count = (await db.execute(select(func.count(PurchaseOrder.id)))).scalar_one()
    return f"PO-{int(count) + 1:06d}"


async def create_po(body: PurchaseOrderCreate, actor_id: UUID | None, db: AsyncSession) -> PurchaseOrder:
    total = sum(i.quantity * i.unit_cost_cents for i in body.items)
    po = PurchaseOrder(
        po_number=await _next_po_number(db),
        supplier_id=body.supplier_id,
        status="draft",
        expected_at=body.expected_at,
        total_cents=total,
        currency=body.currency,
        notes=body.notes,
        created_by_staff_id=actor_id,
    )
    db.add(po)
    await db.flush()
    for item in body.items:
        db.add(
            PurchaseOrderItem(
                purchase_order_id=po.id,
                drug_id=item.drug_id,
                quantity=item.quantity,
                unit_cost_cents=item.unit_cost_cents,
            )
        )
    await db.flush()
    return po


async def get_po(po_id: UUID, db: AsyncSession) -> PurchaseOrder | None:
    return (
        await db.execute(select(PurchaseOrder).where(PurchaseOrder.id == po_id))
    ).scalar_one_or_none()


async def get_po_items(po_id: UUID, db: AsyncSession) -> list[PurchaseOrderItem]:
    return list(
        (
            await db.execute(
                select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po_id)
            )
        ).scalars().all()
    )


async def transition_status(po_id: UUID, new_status: str, db: AsyncSession) -> PurchaseOrder:
    po = await get_po(po_id, db)
    if po is None:
        raise ValueError("po not found")
    valid_from = {
        "draft": {"sent", "cancelled"},
        "sent": {"received", "cancelled"},
        "received": set(),
        "cancelled": set(),
    }
    if new_status not in valid_from.get(po.status, set()):
        raise ValueError(f"cannot transition from {po.status} to {new_status}")
    po.status = new_status
    await db.flush()
    return po


async def receive_goods(
    po_id: UUID,
    body: ReceiveGoodsRequest,
    actor_id: UUID | None,
    db: AsyncSession,
) -> list[DrugBatch]:
    po = await get_po(po_id, db)
    if po is None:
        raise ValueError("po not found")
    if po.status not in ("draft", "sent"):
        raise ValueError(f"cannot receive on PO in status {po.status}")

    items_by_id = {i.id: i for i in await get_po_items(po_id, db)}
    created: list[DrugBatch] = []
    for line in body.lines:
        item = items_by_id.get(line.purchase_order_item_id)
        if item is None:
            raise ValueError(f"po_item {line.purchase_order_item_id} not in PO")
        batch = DrugBatch(
            drug_id=item.drug_id,
            supplier_id=po.supplier_id,
            purchase_order_id=po.id,
            batch_number=line.batch_number,
            quantity_received=line.quantity_received,
            quantity_on_hand=line.quantity_received,
            unit_cost_cents=line.unit_cost_cents if line.unit_cost_cents is not None else item.unit_cost_cents,
            selling_price_cents=0,
            currency=po.currency,
            received_at=body.received_at,
            expiry_date=line.expiry_date,
        )
        db.add(batch)
        await db.flush()
        inventory_service.record_movement(
            db,
            drug_id=item.drug_id,
            batch_id=batch.id,
            delta=line.quantity_received,
            reason="receive",
            ref_type="purchase_order",
            ref_id=po.id,
            actor_staff_id=actor_id,
            note=f"PO {po.po_number}",
        )
        created.append(batch)

    po.status = "received"
    await db.flush()
    return created
