"""Dispense stock and save the sale within the caller's request transaction."""

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select

from ..models.core import Prescription, PrescriptionItem, Sale, SaleItem
from . import inventory_service as inventory
from . import transaction_pricing as pricing
from .medapp_delivery import enqueue


async def prepare(rx_id, body, db):
    rx = await db.scalar(select(Prescription).where(Prescription.id == rx_id).with_for_update())
    if rx is None:
        raise HTTPException(404, "Prescription not found.")
    if rx.version != body.version:
        raise HTTPException(409, "This prescription changed. Reload before dispensing.")
    if rx.status not in ("pending", "partially_dispensed"):
        raise HTTPException(400, f"Prescription is {rx.status}.")
    if rx.valid_until and rx.valid_until < datetime.now(UTC).date():
        raise HTTPException(409, "This prescription has expired; request a new prescription.")
    items = {
        item.id: item
        for item in await db.scalars(
            select(PrescriptionItem).where(PrescriptionItem.prescription_id == rx.id)
        )
    }
    lines = []
    for line in body.items:
        item = items.get(line.prescription_item_id)
        if item is None:
            raise HTTPException(400, "The selected item does not belong to this prescription.")
        if line.quantity > item.quantity_prescribed - item.quantity_dispensed:
            raise HTTPException(400, "The requested quantity exceeds the remaining prescription.")
        lines.append((item.drug_id, line.quantity, None))
    allocations, quote = await pricing.plan(lines, db, expected=body.expected_total_cents)
    return rx, items, allocations, quote


async def dispense(rx_id, body, actor_id, db):
    rx, items, allocations, quote = await prepare(rx_id, body, db)
    sale = Sale(
        sale_number="SL-" + uuid4().hex[:24],
        prescription_id=rx.id,
        customer_id=rx.customer_id,
        cashier_staff_id=actor_id,
        payment_method=body.payment_method,
        payment_ref=body.payment_ref,
        notes=body.notes,
        subtotal_cents=quote.subtotal_cents,
        total_cents=quote.total_cents,
        currency=quote.currency,
        status="completed",
        completed_at=datetime.now(UTC),
    )
    db.add(sale)
    await db.flush()
    result_lines = []
    for line, allocation in zip(body.items, allocations, strict=True):
        item = items[line.prescription_item_id]
        from_batches = []
        for batch, take, price in allocation:
            inventory.change_quantity(batch, -take)
            db.add(
                SaleItem(
                    sale_id=sale.id,
                    prescription_item_id=item.id,
                    drug_id=item.drug_id,
                    drug_batch_id=batch.id,
                    drug_name_snapshot=item.drug_name_snapshot,
                    quantity=take,
                    unit_price_cents=price,
                    line_total_cents=take * price,
                )
            )
            inventory.record_movement(
                db,
                drug_id=item.drug_id,
                batch_id=batch.id,
                delta=-take,
                reason="dispense",
                ref_type="prescription",
                ref_id=rx.id,
                actor_staff_id=actor_id,
                note=f"Rx {rx.rx_number}",
            )
            from_batches.append(
                {"batch_id": str(batch.id), "quantity": take, "unit_price_cents": price}
            )
        item.quantity_dispensed += line.quantity
        result_lines.append(
            {
                "prescription_item_id": item.id,
                "dispensed_quantity": line.quantity,
                "from_batches": from_batches,
            }
        )
    rx.status = (
        "dispensed"
        if all(i.quantity_dispensed >= i.quantity_prescribed for i in items.values())
        else "partially_dispensed"
    )
    rx.version += 1
    await db.flush()
    result = {
        "prescription_id": rx.id,
        "rx_status": rx.status,
        "rx_version": rx.version,
        "sale_id": sale.id,
        "sale_number": sale.sale_number,
        "sale_total_cents": sale.total_cents,
        "currency": sale.currency,
        "lines": result_lines,
    }
    await enqueue(db, rx, "dispensed")
    return result
