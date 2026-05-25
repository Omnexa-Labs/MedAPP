"""Walk-in POS sales: FIFO batch deduction, no prescription required."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.core import Drug, Sale, SaleItem
from ..schemas.sales import WalkInSaleCreate
from . import inventory_service


async def _next_sale_number(db: AsyncSession) -> str:
    n = (await db.execute(select(func.count(Sale.id)))).scalar_one()
    return f"SL-{int(n) + 1:06d}"


async def record_walk_in_sale(
    body: WalkInSaleCreate,
    actor_id: UUID | None,
    db: AsyncSession,
) -> Sale:
    if not body.items:
        raise ValueError("sale must have at least one item")

    sale = Sale(
        sale_number=await _next_sale_number(db),
        prescription_id=None,
        customer_id=body.customer_id,
        cashier_staff_id=actor_id,
        payment_method=body.payment_method,
        payment_ref=body.payment_ref,
        discount_cents=body.discount_cents,
        tax_cents=body.tax_cents,
        currency="GHS",
        status="completed",
        completed_at=datetime.now(tz=timezone.utc),
    )
    db.add(sale)
    await db.flush()

    subtotal = 0
    for line in body.items:
        drug = (
            await db.execute(select(Drug).where(Drug.id == line.drug_id))
        ).scalar_one_or_none()
        if drug is None:
            raise ValueError(f"drug {line.drug_id} not found")

        batches = await inventory_service.fifo_batches(line.drug_id, db)
        available = sum(b.quantity_on_hand for b in batches)
        if available < line.quantity:
            raise ValueError(
                f"insufficient stock for {drug.name}: need {line.quantity}, have {available}"
            )

        remaining = line.quantity
        for batch in batches:
            if remaining == 0:
                break
            take = min(remaining, batch.quantity_on_hand)
            batch.quantity_on_hand -= take
            remaining -= take

            unit_price = (
                line.unit_price_cents
                if line.unit_price_cents is not None
                else batch.selling_price_cents
            )
            line_total = take * unit_price
            subtotal += line_total

            db.add(SaleItem(
                sale_id=sale.id,
                drug_id=drug.id,
                drug_batch_id=batch.id,
                drug_name_snapshot=drug.name,
                quantity=take,
                unit_price_cents=unit_price,
                line_total_cents=line_total,
            ))
            inventory_service.record_movement(
                db,
                drug_id=drug.id,
                batch_id=batch.id,
                delta=-take,
                reason="sale",
                ref_type="sale",
                ref_id=sale.id,
                actor_staff_id=actor_id,
                note=f"Sale {sale.sale_number}",
            )

    sale.subtotal_cents = subtotal
    sale.total_cents = subtotal - body.discount_cents + body.tax_cents
    await db.flush()
    return sale


async def void_sale(sale_id: UUID, actor_id: UUID | None, db: AsyncSession) -> Sale:
    sale = (
        await db.execute(select(Sale).where(Sale.id == sale_id))
    ).scalar_one_or_none()
    if sale is None:
        raise ValueError("sale not found")
    if sale.status == "voided":
        raise ValueError("sale already voided")

    items = (
        await db.execute(select(SaleItem).where(SaleItem.sale_id == sale.id))
    ).scalars().all()

    # Return stock to the originating batches and record reversing movements.
    for item in items:
        from ..models.core import DrugBatch  # local to avoid cycle at import time

        batch = (
            await db.execute(select(DrugBatch).where(DrugBatch.id == item.drug_batch_id))
        ).scalar_one_or_none()
        if batch is not None:
            batch.quantity_on_hand += item.quantity
        inventory_service.record_movement(
            db,
            drug_id=item.drug_id,
            batch_id=item.drug_batch_id,
            delta=item.quantity,
            reason="return",
            ref_type="sale_void",
            ref_id=sale.id,
            actor_staff_id=actor_id,
            note=f"Void {sale.sale_number}",
        )

    sale.status = "voided"
    await db.flush()
    return sale
