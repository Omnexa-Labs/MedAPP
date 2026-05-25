"""Dispensing flow: consume FIFO batches, record movements, transition Rx,
create a Sale record so dispenses show up in the sales ledger.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.core import (
    Drug,
    PrescriptionItem,
    Prescription,
    Sale,
    SaleItem,
)
from ..schemas.prescriptions import DispenseRequest
from . import inventory_service, medapp_integration


async def _next_sale_number(db: AsyncSession) -> str:
    n = (await db.execute(select(func.count(Sale.id)))).scalar_one()
    return f"SL-{int(n) + 1:06d}"


async def dispense(
    rx_id: UUID,
    body: DispenseRequest,
    actor_id: UUID | None,
    db: AsyncSession,
) -> dict:
    rx = (
        await db.execute(select(Prescription).where(Prescription.id == rx_id))
    ).scalar_one_or_none()
    if rx is None:
        raise ValueError("prescription not found")
    if rx.status in ("dispensed", "cancelled"):
        raise ValueError(f"prescription is {rx.status}")

    items_by_id = {
        i.id: i
        for i in (
            (await db.execute(
                select(PrescriptionItem).where(PrescriptionItem.prescription_id == rx_id)
            )).scalars().all()
        )
    }

    sale = Sale(
        sale_number=await _next_sale_number(db),
        prescription_id=rx.id,
        customer_id=rx.customer_id,
        cashier_staff_id=actor_id,
        payment_method=body.payment_method,
        payment_ref=body.payment_ref,
        currency="GHS",
        status="completed",
        completed_at=datetime.now(tz=timezone.utc),
    )
    db.add(sale)
    await db.flush()

    total_cents = 0
    result_lines = []

    for line in body.items:
        item = items_by_id.get(line.prescription_item_id)
        if item is None:
            raise ValueError(f"rx item {line.prescription_item_id} not in this prescription")
        outstanding = item.quantity_prescribed - item.quantity_dispensed
        if line.quantity > outstanding:
            raise ValueError(
                f"item {item.id}: requested {line.quantity}, only {outstanding} outstanding"
            )

        batches = await inventory_service.fifo_batches(item.drug_id, db)
        available = sum(b.quantity_on_hand for b in batches)
        if available < line.quantity:
            raise ValueError(
                f"insufficient stock for drug {item.drug_id}: need {line.quantity}, have {available}"
            )

        remaining = line.quantity
        from_batches = []
        for batch in batches:
            if remaining == 0:
                break
            take = min(remaining, batch.quantity_on_hand)
            batch.quantity_on_hand -= take
            remaining -= take

            line_total = take * batch.selling_price_cents
            total_cents += line_total

            db.add(SaleItem(
                sale_id=sale.id,
                drug_id=item.drug_id,
                drug_batch_id=batch.id,
                drug_name_snapshot=item.drug_name_snapshot,
                quantity=take,
                unit_price_cents=batch.selling_price_cents,
                line_total_cents=line_total,
            ))
            inventory_service.record_movement(
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
            from_batches.append({
                "batch_id": str(batch.id),
                "quantity": take,
                "unit_price_cents": batch.selling_price_cents,
            })

        item.quantity_dispensed += line.quantity
        result_lines.append({
            "prescription_item_id": item.id,
            "dispensed_quantity": line.quantity,
            "from_batches": from_batches,
        })

    # Update Rx status
    all_items = list(items_by_id.values())
    if all(i.quantity_dispensed >= i.quantity_prescribed for i in all_items):
        rx.status = "dispensed"
    elif any(i.quantity_dispensed > 0 for i in all_items):
        rx.status = "partially_dispensed"

    sale.subtotal_cents = total_cents
    sale.total_cents = total_cents
    await db.flush()

    # Fire-and-forget outbound to MedApp if this Rx came from there.
    if rx.source == "medapp" and rx.external_ref:
        try:
            await medapp_integration.confirm_dispense({
                "external_ref": rx.external_ref,
                "rx_number": rx.rx_number,
                "status": rx.status,
                "sale_number": sale.sale_number,
                "sale_total_cents": total_cents,
                "currency": sale.currency,
                "lines": result_lines,
            })
        except Exception:
            pass

    return {
        "prescription_id": rx.id,
        "rx_status": rx.status,
        "sale_id": sale.id,
        "sale_total_cents": total_cents,
        "currency": sale.currency,
        "lines": result_lines,
    }
