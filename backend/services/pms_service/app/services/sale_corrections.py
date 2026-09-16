"""Append-only sale credits, physical disposition and external refund records."""

from collections import defaultdict
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func, select

from ..models.core import (
    DrugBatch,
    Prescription,
    PrescriptionItem,
    Sale,
    SaleCorrection,
    SaleCorrectionItem,
    SaleItem,
    SaleRefund,
    Staff,
)
from ..schemas.sale_corrections import CorrectionItemOut, CorrectionOut, CorrectionQuote
from . import inventory_service as inventory


async def lock_sale(sale_id, version, db):
    sale = await db.scalar(
        select(Sale)
        .where(Sale.id == sale_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if sale is None:
        raise HTTPException(404, "Sale not found.")
    if sale.version != version:
        raise HTTPException(
            409, "This sale changed. Reload the receipt before making another change."
        )
    return sale


async def lock_prescription(sale, version, db):
    if not sale.prescription_id:
        if version is not None:
            raise HTTPException(422, "This sale has no prescription revision.")
        return None, {}
    rx = await db.scalar(
        select(Prescription)
        .where(Prescription.id == sale.prescription_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if not rx or version != rx.version:
        raise HTTPException(409, "This prescription changed. Reload the prescription and receipt.")
    items = {
        item.id: item
        for item in await db.scalars(
            select(PrescriptionItem)
            .where(PrescriptionItem.prescription_id == rx.id)
            .execution_options(populate_existing=True)
        )
    }
    if rx.status not in {"pending", "partially_dispensed", "dispensed", "cancelled"} or any(
        item.quantity_dispensed < 0 or item.quantity_dispensed > item.quantity_prescribed
        for item in items.values()
    ):
        raise HTTPException(
            409,
            "This prescription has inconsistent historical status or quantities. Review its records before correction.",
        )
    return rx, items


async def totals(db, sale_ids):
    credits, refunds = {}, {}
    if sale_ids:
        credits = dict(
            (
                await db.execute(
                    select(SaleCorrection.sale_id, func.sum(SaleCorrection.credit_cents))
                    .where(SaleCorrection.sale_id.in_(sale_ids))
                    .group_by(SaleCorrection.sale_id)
                )
            ).all()
        )
        refunds = dict(
            (
                await db.execute(
                    select(SaleRefund.sale_id, func.sum(SaleRefund.amount_cents))
                    .where(SaleRefund.sale_id.in_(sale_ids), SaleRefund.status == "recorded")
                    .group_by(SaleRefund.sale_id)
                )
            ).all()
        )
    return credits, refunds


async def corrected_quantities(db, item_ids):
    if not item_ids:
        return {}
    return dict(
        (
            await db.execute(
                select(SaleCorrectionItem.sale_item_id, func.sum(SaleCorrectionItem.quantity))
                .where(SaleCorrectionItem.sale_item_id.in_(item_ids))
                .group_by(SaleCorrectionItem.sale_item_id)
            )
        ).all()
    )


def allocated_amounts(sale, items):
    """Allocate original discount/tax exactly once using integer largest remainders."""
    if (
        any(
            i.quantity <= 0
            or i.line_total_cents != i.quantity * i.unit_price_cents
            or i.unit_price_cents < 0
            for i in items
        )
        or sum(i.line_total_cents for i in items) != sale.subtotal_cents
        or sale.total_cents != sale.subtotal_cents - sale.discount_cents + sale.tax_cents
        or not 0 <= sale.discount_cents <= sale.subtotal_cents
        or sale.total_cents < 0
    ):
        raise HTTPException(
            409,
            "This receipt has inconsistent historical amounts. Reconcile its records before a correction.",
        )
    denominator = sale.subtotal_cents or sum(i.quantity for i in items)
    if not denominator:
        raise HTTPException(409, "This receipt has no allocatable items.")
    amounts, remainders = {}, []
    for item in items:
        weight = item.line_total_cents if sale.subtotal_cents else item.quantity
        amounts[item.id], remainder = divmod(sale.total_cents * weight, denominator)
        remainders.append((remainder, str(item.id), item.id))
    for _, _, item_id in sorted(remainders, key=lambda row: (-row[0], row[1]))[
        : sale.total_cents - sum(amounts.values())
    ]:
        amounts[item_id] += 1
    return amounts


async def prepare(sale_id, body, db):
    sale = await lock_sale(sale_id, body.version, db)
    if sale.status != "completed":
        raise HTTPException(400, "A voided sale cannot receive another stock correction.")
    rx, rx_items = await lock_prescription(sale, body.prescription_version, db)
    items = list(
        await db.scalars(select(SaleItem).where(SaleItem.sale_id == sale.id).order_by(SaleItem.id))
    )
    by_id = {item.id: item for item in items}
    corrected = await corrected_quantities(db, by_id)
    amounts = allocated_amounts(sale, items)
    rx_changes = defaultdict(int)
    quote_lines = []
    for line in body.items:
        item = by_id.get(line.sale_item_id)
        if not item or line.quantity > item.quantity - corrected.get(item.id, 0):
            raise HTTPException(
                400, "Choose quantities still available for correction on this receipt."
            )
        before = corrected.get(item.id, 0)
        credit = (
            amounts[item.id] * (before + line.quantity) // item.quantity
            - amounts[item.id] * before // item.quantity
        )
        quote_lines.append(
            CorrectionItemOut(sale_item_id=item.id, quantity=line.quantity, credit_cents=credit)
        )
        if rx and body.kind == "not_collected":
            rx_item = rx_items.get(item.prescription_item_id)
            if not rx_item or rx_item.drug_id != item.drug_id:
                raise HTTPException(
                    409,
                    "This older dispense lacks a verified prescription-line link. An administrator must reconcile it first.",
                )
            rx_changes[rx_item.id] += line.quantity
    if any(
        quantity > rx_items[item_id].quantity_dispensed for item_id, quantity in rx_changes.items()
    ):
        raise HTTPException(
            409,
            "The historical dispensing balance does not support this correction. Reconcile the prescription first.",
        )
    return (
        sale,
        rx,
        rx_items,
        by_id,
        rx_changes,
        CorrectionQuote(
            credit_cents=sum(line.credit_cents for line in quote_lines),
            currency=sale.currency,
            items=quote_lines,
        ),
    )


async def correct(sale_id, body, actor, db):
    sale, rx, rx_items, by_id, rx_changes, quote = await prepare(sale_id, body, db)
    if body.kind == "not_collected":
        await inventory.lock_drugs(db, [by_id[line.sale_item_id].drug_id for line in body.items])
    correction = SaleCorrection(
        sale_id=sale.id,
        number="CR-" + uuid4().hex[:24],
        kind=body.kind,
        reason=body.reason,
        credit_cents=quote.credit_cents,
        actor_staff_id=actor,
    )
    db.add(correction)
    await db.flush()
    for line in quote.items:
        item = by_id[line.sale_item_id]
        if body.kind == "not_collected":
            batch = await db.get(DrugBatch, item.drug_batch_id, populate_existing=True)
            if not batch or batch.drug_id != item.drug_id:
                raise HTTPException(
                    409,
                    "An original batch is missing or inconsistent. Reconcile stock before correcting this sale.",
                )
            inventory.change_quantity(batch, line.quantity)
            inventory.record_movement(
                db,
                drug_id=item.drug_id,
                batch_id=batch.id,
                delta=line.quantity,
                reason="return",
                ref_type="sale_correction",
                ref_id=correction.id,
                actor_staff_id=actor,
                note=f"{correction.number}: {body.reason}",
            )
        db.add(
            SaleCorrectionItem(
                correction_id=correction.id,
                sale_item_id=item.id,
                quantity=line.quantity,
                credit_cents=line.credit_cents,
            )
        )
    if rx_changes:
        for item_id, quantity in rx_changes.items():
            rx_items[item_id].quantity_dispensed -= quantity
        # Cancellation remains a separate clinical decision; do not reopen it.
        if rx.status != "cancelled":
            rx.status = (
                "partially_dispensed"
                if any(i.quantity_dispensed for i in rx_items.values())
                else "pending"
            )
        rx.version += 1
    sale.version += 1
    await db.flush()
    return correction


async def correction_outputs(rows, db):
    grouped = {row.id: [] for row in rows}
    if grouped:
        for item in await db.scalars(
            select(SaleCorrectionItem)
            .where(SaleCorrectionItem.correction_id.in_(grouped))
            .order_by(SaleCorrectionItem.id)
        ):
            grouped[item.correction_id].append(CorrectionItemOut.model_validate(item))
    names = (
        dict(
            (
                await db.execute(
                    select(Staff.id, Staff.full_name).where(
                        Staff.id.in_({row.actor_staff_id for row in rows})
                    )
                )
            ).all()
        )
        if rows
        else {}
    )
    return [
        CorrectionOut(
            **{
                key: getattr(row, key)
                for key in CorrectionOut.model_fields
                if key not in {"items", "actor_name"}
            },
            items=grouped[row.id],
            actor_name=names.get(row.actor_staff_id),
        )
        for row in rows
    ]


async def record_refund(sale_id, body, actor, db):
    sale = await lock_sale(sale_id, body.version, db)
    if await db.scalar(
        select(SaleRefund.id)
        .where(
            SaleRefund.sale_id == sale.id,
            SaleRefund.status == "recorded",
            SaleRefund.payment_method == body.payment_method,
            SaleRefund.payment_ref == body.payment_ref,
        )
        .limit(1)
    ):
        raise HTTPException(
            409,
            "This refund reference is already recorded on the receipt. Review its refund history.",
        )
    credits, refunds = await totals(db, [sale.id])
    entitlement = sale.total_cents if sale.status == "voided" else credits.get(sale.id, 0)
    if body.amount_cents > entitlement - refunds.get(sale.id, 0):
        raise HTTPException(
            400,
            "The refund exceeds the remaining credited amount. Record the sale correction first.",
        )
    refund = SaleRefund(
        sale_id=sale.id,
        number="RF-" + uuid4().hex[:24],
        amount_cents=body.amount_cents,
        payment_method=body.payment_method,
        payment_ref=body.payment_ref,
        reason=body.reason,
        actor_staff_id=actor,
    )
    db.add(refund)
    sale.version += 1
    await db.flush()
    return refund


async def void_refund(sale_id, refund_id, body, actor, db):
    sale = await lock_sale(sale_id, body.version, db)
    refund = await db.get(SaleRefund, refund_id)
    if not refund or refund.sale_id != sale.id:
        raise HTTPException(404, "Refund record not found.")
    if refund.status != "recorded":
        raise HTTPException(400, "This refund record has already been marked incorrect.")
    refund.status, refund.void_reason = "voided", body.reason
    refund.voided_at, refund.voided_by = datetime.now(UTC), actor
    sale.version += 1
    await db.flush()
    return refund


async def reconcile(sale_id, body, db):
    sale = await lock_sale(sale_id, body.version, db)
    if not sale.prescription_id or sale.status != "completed":
        raise HTTPException(400, "Choose a completed prescription sale.")
    rx, rx_items = await lock_prescription(sale, body.prescription_version, db)
    items = list(await db.scalars(select(SaleItem).where(SaleItem.sale_id == sale.id)))
    allocations = {line.sale_item_id: line.prescription_item_id for line in body.allocations}
    if len(allocations) != len(body.allocations) or set(allocations) != {item.id for item in items}:
        raise HTTPException(422, "Map every receipt line exactly once.")
    if all(item.prescription_item_id for item in items):
        raise HTTPException(400, "This receipt already has its prescription links.")
    for item in items:
        target = rx_items.get(allocations[item.id])
        if (
            not target
            or target.drug_id != item.drug_id
            or (item.prescription_item_id and item.prescription_item_id != target.id)
        ):
            raise HTTPException(
                422,
                "Each link must match the recorded drug and prescription; existing links cannot be replaced.",
            )
        item.prescription_item_id = target.id
    await db.flush()
    # Existing customer returns retain the clinical dispense; only never-collected
    # corrections reduce the balance used to validate historical allocations.
    mapped = dict(
        (
            await db.execute(
                select(SaleItem.prescription_item_id, func.sum(SaleItem.quantity))
                .join(Sale, Sale.id == SaleItem.sale_id)
                .where(
                    Sale.prescription_id == rx.id,
                    Sale.status == "completed",
                    SaleItem.prescription_item_id.is_not(None),
                )
                .group_by(SaleItem.prescription_item_id)
            )
        ).all()
    )
    reduced = dict(
        (
            await db.execute(
                select(SaleItem.prescription_item_id, func.sum(SaleCorrectionItem.quantity))
                .join(SaleCorrectionItem, SaleCorrectionItem.sale_item_id == SaleItem.id)
                .join(SaleCorrection, SaleCorrection.id == SaleCorrectionItem.correction_id)
                .where(
                    SaleItem.prescription_item_id.in_(rx_items),
                    SaleCorrection.kind == "not_collected",
                )
                .group_by(SaleItem.prescription_item_id)
            )
        ).all()
    )
    if any(
        item_id not in rx_items
        or quantity - reduced.get(item_id, 0) > rx_items[item_id].quantity_dispensed
        for item_id, quantity in mapped.items()
    ):
        raise HTTPException(
            409,
            "Recorded sales exceed the prescription's dispensing balance. Review the historical records before linking them.",
        )
    sale.version += 1
    rx.version += 1
    await db.flush()
    return sale
