"""Use the same FEFO allocation and batch prices for review and the locked write."""

from fastapi import HTTPException

from ..models.core import Customer
from ..schemas.transactions import QuoteLine, TransactionQuote
from . import inventory_service as inventory


async def check_customer(customer_id, db):
    if customer_id and not await db.get(Customer, customer_id):
        raise HTTPException(400, "The selected customer no longer exists.")


async def plan(lines, db, *, discount=0, tax=0, expected=None, walk_in=False):
    """Lines are (drug_id, quantity, optional price). Caller locks the Rx first."""
    drugs = await inventory.lock_drugs(db, [line[0] for line in lines])
    currency = await inventory.pharmacy_currency(db)
    batches_by_drug = {}
    available = {}
    allocations = []
    quotes = []
    for drug_id, quantity, override in lines:
        drug = drugs.get(drug_id)
        if not drug or not drug.is_active or drug.currency != currency:
            raise HTTPException(400, "Items must be active drugs in the pharmacy currency.")
        if walk_in and drug.requires_prescription:
            raise HTTPException(
                400, "Prescription-only drugs must be dispensed through a prescription."
            )
        if drug_id not in batches_by_drug:
            batches_by_drug[drug_id] = await inventory.fifo_batches(drug_id, db)
            for batch in batches_by_drug[drug_id]:
                available[batch.id] = batch.quantity_on_hand
        remaining = quantity
        allocation = []
        for batch in batches_by_drug[drug_id]:
            take = min(remaining, available[batch.id])
            if not take:
                continue
            price = batch.selling_price_cents if override is None else override
            allocation.append((batch, take, price))
            quotes.append(
                QuoteLine(
                    drug_id=drug_id,
                    drug_name=drug.name,
                    batch_id=batch.id,
                    batch_number=batch.batch_number,
                    quantity=take,
                    unit_price_cents=price,
                    line_total_cents=take * price,
                )
            )
            available[batch.id] -= take
            remaining -= take
            if not remaining:
                break
        if remaining:
            raise HTTPException(
                400, f"Insufficient usable stock for {drug.name}: {remaining} units short."
            )
        allocations.append(allocation)
    subtotal = sum(line.line_total_cents for line in quotes)
    total = subtotal - discount + tax
    if discount > subtotal or not 0 <= total <= 2_147_483_647 or subtotal > 2_147_483_647:
        raise HTTPException(400, "The total or discount is outside the supported amount.")
    if expected is not None and expected != total:
        raise HTTPException(
            409, "Batch prices changed. Review the current total before recording payment."
        )
    return allocations, TransactionQuote(
        subtotal_cents=subtotal,
        discount_cents=discount,
        tax_cents=tax,
        total_cents=total,
        currency=currency,
        items=quotes,
    )
