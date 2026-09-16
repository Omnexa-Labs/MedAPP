"""Walk-in sales and stock reversal, serialized with every inventory writer."""

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select

from ..models.core import DrugBatch, Sale, SaleCorrection, SaleItem, SaleRefund
from . import inventory_service as inventory
from . import transaction_pricing as pricing


async def prepare(body, db):
    await pricing.check_customer(body.customer_id, db)
    return await pricing.plan(
        [(line.drug_id, line.quantity, line.unit_price_cents) for line in body.items],
        db,
        discount=body.discount_cents,
        tax=body.tax_cents,
        expected=body.expected_total_cents,
        walk_in=True,
    )


async def record_walk_in_sale(body, actor_id, db):
    allocations, quote = await prepare(body, db)
    sale = Sale(
        sale_number="SL-" + uuid4().hex[:24],
        customer_id=body.customer_id,
        cashier_staff_id=actor_id,
        payment_method=body.payment_method,
        payment_ref=body.payment_ref,
        notes=body.notes,
        subtotal_cents=quote.subtotal_cents,
        discount_cents=quote.discount_cents,
        tax_cents=quote.tax_cents,
        total_cents=quote.total_cents,
        currency=quote.currency,
        status="completed",
        completed_at=datetime.now(UTC),
    )
    db.add(sale)
    await db.flush()
    index = 0
    for allocation in allocations:
        for batch, take, price in allocation:
            inventory.change_quantity(batch, -take)
            db.add(
                SaleItem(
                    sale_id=sale.id,
                    drug_id=batch.drug_id,
                    drug_batch_id=batch.id,
                    drug_name_snapshot=quote.items[index].drug_name,
                    quantity=take,
                    unit_price_cents=price,
                    line_total_cents=take * price,
                )
            )
            index += 1
            inventory.record_movement(
                db,
                drug_id=batch.drug_id,
                batch_id=batch.id,
                delta=-take,
                reason="sale",
                ref_type="sale",
                ref_id=sale.id,
                actor_staff_id=actor_id,
                note=f"Sale {sale.sale_number}",
            )
    await db.flush()
    return sale


async def void_sale(sale_id, body, actor_id, db):
    sale = await db.scalar(select(Sale).where(Sale.id == sale_id).with_for_update())
    if sale is None:
        raise HTTPException(404, "Sale not found.")
    if sale.version != body.version:
        raise HTTPException(409, "This sale changed. Reload before making another change.")
    if sale.status != "completed":
        raise HTTPException(400, "This sale is already voided.")
    if await db.scalar(
        select(SaleCorrection.id).where(SaleCorrection.sale_id == sale.id).limit(1)
    ) or await db.scalar(select(SaleRefund.id).where(SaleRefund.sale_id == sale.id).limit(1)):
        raise HTTPException(
            409,
            "This sale has correction or refund records. Correct the remaining receipt lines instead of voiding it.",
        )
    if sale.prescription_id:
        raise HTTPException(
            400,
            "Prescription sales require a prescription correction before stock can be returned.",
        )
    items = list(await db.scalars(select(SaleItem).where(SaleItem.sale_id == sale.id)))
    await inventory.lock_drugs(db, [item.drug_id for item in items])
    for item in items:
        batch = await db.get(DrugBatch, item.drug_batch_id, populate_existing=True)
        if batch is None:
            raise HTTPException(
                409, "An original stock batch is missing. Reconcile this sale before voiding it."
            )
        inventory.change_quantity(batch, item.quantity)
        inventory.record_movement(
            db,
            drug_id=item.drug_id,
            batch_id=item.drug_batch_id,
            delta=item.quantity,
            reason="return",
            ref_type="sale_void",
            ref_id=sale.id,
            actor_staff_id=actor_id,
            note=f"Void {sale.sale_number}: {body.reason}",
        )
    sale.status = "voided"
    sale.void_reason = body.reason
    sale.version += 1
    await db.flush()
    return sale
