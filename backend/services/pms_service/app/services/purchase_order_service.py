from collections import defaultdict
from datetime import date
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import delete, select

from ..models.core import Drug, DrugBatch, PurchaseOrder, PurchaseOrderItem, Supplier
from ..schemas.purchase_orders import PurchaseOrderOut
from . import inventory_service as inventory


async def get_po(po_id, db, *, lock=False):
    stmt = select(PurchaseOrder).where(PurchaseOrder.id == po_id)
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    po = await db.scalar(stmt)
    if po is None:
        raise HTTPException(404, "Purchase order not found.")
    return po


async def get_po_items(po_id, db):
    return list(
        await db.scalars(
            select(PurchaseOrderItem)
            .where(PurchaseOrderItem.purchase_order_id == po_id)
            .order_by(PurchaseOrderItem.created_at, PurchaseOrderItem.id)
        )
    )


async def serialize_orders(db, orders):
    if not orders:
        return []
    items = defaultdict(list)
    rows = (
        await db.execute(
            select(PurchaseOrderItem, Drug.name, Drug.strength)
            .outerjoin(Drug, Drug.id == PurchaseOrderItem.drug_id)
            .where(PurchaseOrderItem.purchase_order_id.in_([po.id for po in orders]))
            .order_by(PurchaseOrderItem.created_at, PurchaseOrderItem.id)
        )
    ).all()
    for item, name, strength in rows:
        items[item.purchase_order_id].append(
            (
                item,
                item.drug_name_snapshot or (f"{name} · {strength}" if name else "Historical drug"),
            )
        )
    suppliers = {
        supplier.id: supplier.name
        for supplier in await db.scalars(
            select(Supplier).where(Supplier.id.in_({po.supplier_id for po in orders}))
        )
    }
    out = []
    for po in orders:
        lines = []
        for item, name in items[po.id]:
            remaining = max(0, item.quantity - item.quantity_received)
            lines.append(
                dict(
                    id=item.id,
                    purchase_order_id=po.id,
                    drug_id=item.drug_id,
                    drug_name=name,
                    quantity=item.quantity,
                    unit_cost_cents=item.unit_cost_cents,
                    quantity_received=item.quantity_received if po.receiving_reconciled else None,
                    quantity_outstanding=(0 if po.status == "cancelled" else remaining)
                    if po.receiving_reconciled
                    else None,
                    quantity_cancelled=(remaining if po.status == "cancelled" else 0)
                    if po.receiving_reconciled
                    else None,
                )
            )
        fields = {
            field: getattr(po, field)
            for field in PurchaseOrderOut.model_fields
            if field not in {"items", "supplier_name"}
        }
        out.append(
            PurchaseOrderOut(
                **fields,
                supplier_name=po.supplier_name_snapshot
                or suppliers.get(po.supplier_id, "Historical supplier"),
                items=lines,
            )
        )
    return out


async def validate_catalog(db, supplier_id, lines, currency):
    supplier = await db.get(Supplier, supplier_id)
    if not supplier or not supplier.is_active:
        raise HTTPException(422, "Choose an active supplier.")
    actual_currency = await inventory.pharmacy_currency(db)
    if currency and currency != actual_currency:
        raise HTTPException(422, "The order must use the pharmacy currency.")
    drugs = await inventory.lock_drugs(db, [line.drug_id for line in lines])
    if any(
        line.drug_id not in drugs
        or not drugs[line.drug_id].is_active
        or drugs[line.drug_id].currency != actual_currency
        for line in lines
    ):
        raise HTTPException(422, "Choose active drugs in the pharmacy currency.")
    return supplier, drugs, actual_currency


async def set_draft(po, body, db):
    if po.status != "draft" or not po.receiving_reconciled:
        raise HTTPException(409, "Only a draft without receipt history can be edited.")
    if await db.scalar(select(DrugBatch.id).where(DrugBatch.purchase_order_id == po.id).limit(1)):
        raise HTTPException(409, "Reconcile existing deliveries before changing this order.")
    supplier, drugs, currency = await validate_catalog(
        db, body.supplier_id, body.items, body.currency
    )
    po.supplier_id, po.supplier_name_snapshot, po.currency = supplier.id, supplier.name, currency
    po.expected_at, po.notes = body.expected_at, body.notes or None
    po.total_cents = sum(line.quantity * line.unit_cost_cents for line in body.items)
    await db.execute(delete(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id))
    for line in body.items:
        drug = drugs[line.drug_id]
        db.add(
            PurchaseOrderItem(
                purchase_order_id=po.id,
                drug_id=drug.id,
                drug_name_snapshot=f"{drug.name} · {drug.strength}",
                quantity=line.quantity,
                quantity_received=0,
                unit_cost_cents=line.unit_cost_cents,
            )
        )
    await db.flush()


async def create_po(body, actor_id, db):
    po = PurchaseOrder(
        po_number="PO-" + uuid4().hex[:24],
        supplier_id=body.supplier_id,
        created_by_staff_id=actor_id,
        status="draft",
        receiving_reconciled=True,
        version=1,
    )
    # Validate before flushing a foreign-key reference supplied by the client.
    await validate_catalog(db, body.supplier_id, body.items, body.currency)
    db.add(po)
    await db.flush()
    await set_draft(po, body, db)
    return po


async def mark_ordered(po, db):
    if po.status != "draft" or not po.receiving_reconciled:
        raise HTTPException(409, "Only a reconciled draft can be marked as ordered.")
    items = await get_po_items(po.id, db)
    if not items:
        raise HTTPException(409, "Add items before marking this order as placed.")
    await validate_catalog(db, po.supplier_id, items, po.currency)
    po.status = "sent"


def cancel(po, body):
    if not po.receiving_reconciled:
        raise HTTPException(409, "Reconcile earlier receipts before cancelling the remainder.")
    if po.status not in ("draft", "sent", "partially_received"):
        raise HTTPException(409, "This order has already been closed.")
    po.status, po.cancellation_reason = "cancelled", body.reason


async def receive_goods(po, body, actor_id, db):
    if not po.receiving_reconciled:
        raise HTTPException(409, "Reconcile earlier receipts before receiving more stock.")
    if po.status not in ("sent", "partially_received"):
        raise HTTPException(409, "Receive stock against an ordered or partly received order.")
    today = date.today()
    if body.received_at > today or any(line.expiry_date < today for line in body.lines):
        raise HTTPException(422, "New stock cannot be expired or received in the future.")
    items = {item.id: item for item in await get_po_items(po.id, db)}
    requested = defaultdict(int)
    for line in body.lines:
        if line.purchase_order_item_id not in items:
            raise HTTPException(422, "A receipt line does not belong to this order.")
        requested[line.purchase_order_item_id] += line.quantity_received
    if any(
        quantity > items[key].quantity - items[key].quantity_received
        for key, quantity in requested.items()
    ):
        raise HTTPException(
            409, "Received quantities exceed the outstanding order. Reload and check the delivery."
        )
    drugs = await inventory.lock_drugs(db, [items[key].drug_id for key in requested])
    currency = await inventory.pharmacy_currency(db)
    if po.currency != currency or any(
        drug_id not in drugs or not drugs[drug_id].is_active or drugs[drug_id].currency != currency
        for drug_id in [items[key].drug_id for key in requested]
    ):
        raise HTTPException(422, "Received drugs must be active and use the pharmacy currency.")
    created = []
    total_cost = 0
    for line in body.lines:
        item = items[line.purchase_order_item_id]
        drug = drugs[item.drug_id]
        cost = item.unit_cost_cents if line.unit_cost_cents is None else line.unit_cost_cents
        total_cost += cost * line.quantity_received
        if total_cost > 2_147_483_647:
            raise HTTPException(422, "The delivery cost exceeds the supported amount.")
        batch = DrugBatch(
            drug_id=drug.id,
            supplier_id=po.supplier_id,
            purchase_order_id=po.id,
            purchase_order_item_id=item.id,
            delivery_reference=body.delivery_reference or None,
            batch_number=line.batch_number,
            quantity_received=line.quantity_received,
            quantity_on_hand=line.quantity_received,
            unit_cost_cents=cost,
            selling_price_cents=drug.default_selling_price_cents
            if line.selling_price_cents is None
            else line.selling_price_cents,
            currency=currency,
            received_at=body.received_at,
            expiry_date=line.expiry_date,
        )
        db.add(batch)
        await db.flush()
        inventory.record_movement(
            db,
            drug_id=drug.id,
            batch_id=batch.id,
            delta=line.quantity_received,
            reason="receive",
            ref_type="purchase_order",
            ref_id=po.id,
            actor_staff_id=actor_id,
            note=f"PO {po.po_number}"
            + (f" · {body.delivery_reference}" if body.delivery_reference else ""),
        )
        item.quantity_received += line.quantity_received
        created.append(str(batch.id))
    po.status = (
        "received"
        if all(item.quantity_received >= item.quantity for item in items.values())
        else "partially_received"
    )
    return created


async def reconcile(po, body, db):
    if po.receiving_reconciled:
        raise HTTPException(409, "This order already has tracked receipts.")
    items = {item.id: item for item in await get_po_items(po.id, db)}
    batches = list(await db.scalars(select(DrugBatch).where(DrugBatch.purchase_order_id == po.id)))
    allocations = {line.batch_id: line.purchase_order_item_id for line in body.allocations}
    if (
        not batches
        or len(allocations) != len(body.allocations)
        or set(allocations) != {batch.id for batch in batches}
    ):
        raise HTTPException(
            422,
            "Assign every historical batch exactly once. Missing batch evidence requires a separate records review.",
        )
    await inventory.lock_drugs(db, [batch.drug_id for batch in batches])
    # A sale may have changed a batch while this reconciliation waited for its lock.
    batches = list(
        await db.scalars(
            select(DrugBatch)
            .where(DrugBatch.purchase_order_id == po.id)
            .execution_options(populate_existing=True)
        )
    )
    for item in items.values():
        item.quantity_received = 0
    for batch in batches:
        item = items.get(allocations[batch.id])
        if (
            not item
            or item.drug_id != batch.drug_id
            or batch.quantity_received <= 0
            or batch.purchase_order_item_id
        ):
            raise HTTPException(
                422,
                "Each untracked batch must match a drug line on this order and have a positive receipt quantity.",
            )
        item.quantity_received += batch.quantity_received
        if item.quantity_received > 2_147_483_647:
            raise HTTPException(422, "Historical quantities exceed the supported amount.")
        batch.purchase_order_item_id = item.id
        batch.version += 1
    po.receiving_reconciled = True
    if po.status != "cancelled":
        po.status = (
            "received"
            if all(item.quantity_received >= item.quantity for item in items.values())
            else "partially_received"
        )
