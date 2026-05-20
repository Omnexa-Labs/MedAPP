from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.billing import Invoice, InvoiceLineItem, Payment
from ..schemas.billing import InvoiceCreate, InvoiceUpdate, PaymentCreate


async def _generate_invoice_number(db: AsyncSession) -> str:
    today = datetime.now(tz=timezone.utc).strftime("%Y%m%d")
    result = await db.execute(
        select(func.count(Invoice.id)).where(Invoice.invoice_number.like(f"INV-{today}%"))
    )
    count = result.scalar_one() + 1
    return f"INV-{today}-{count:04d}"


async def create_invoice(
    body: InvoiceCreate, created_by: UUID, db: AsyncSession
) -> Invoice:
    invoice_number = await _generate_invoice_number(db)
    total = sum(item.unit_price_cents * item.quantity for item in body.items)

    invoice = Invoice(
        visit_id=body.visit_id,
        patient_id=body.patient_id,
        invoice_number=invoice_number,
        total_amount_cents=total,
        currency=body.currency,
        notes=body.notes,
        created_by_staff_id=created_by,
    )
    db.add(invoice)
    await db.flush()

    for item in body.items:
        line = InvoiceLineItem(
            invoice_id=invoice.id,
            description=item.description,
            category=item.category,
            quantity=item.quantity,
            unit_price_cents=item.unit_price_cents,
            total_cents=item.unit_price_cents * item.quantity,
        )
        db.add(line)
    await db.flush()
    return invoice


async def list_invoices(
    db: AsyncSession,
    patient_id: UUID | None = None,
    status: str | None = None,
) -> list[Invoice]:
    query = select(Invoice)
    if patient_id:
        query = query.where(Invoice.patient_id == patient_id)
    if status:
        query = query.where(Invoice.status == status)
    result = await db.execute(query.order_by(Invoice.created_at.desc()))
    return list(result.scalars().all())


async def get_invoice(invoice_id: UUID, db: AsyncSession) -> Invoice | None:
    result = await db.execute(select(Invoice).where(Invoice.id == invoice_id))
    return result.scalar_one_or_none()


async def get_invoice_line_items(invoice_id: UUID, db: AsyncSession) -> list[InvoiceLineItem]:
    result = await db.execute(
        select(InvoiceLineItem).where(InvoiceLineItem.invoice_id == invoice_id)
    )
    return list(result.scalars().all())


async def update_invoice(
    invoice_id: UUID, body: InvoiceUpdate, db: AsyncSession
) -> Invoice | None:
    invoice = await get_invoice(invoice_id, db)
    if invoice is None:
        return None
    if body.status == "issued" and invoice.issued_at is None:
        invoice.issued_at = datetime.now(tz=timezone.utc)
    if body.status:
        invoice.status = body.status
    if body.notes is not None:
        invoice.notes = body.notes
    await db.flush()
    return invoice


async def add_line_item(
    invoice_id: UUID, description: str, category: str, quantity: int, unit_price_cents: int, db: AsyncSession
) -> InvoiceLineItem:
    line = InvoiceLineItem(
        invoice_id=invoice_id,
        description=description,
        category=category,
        quantity=quantity,
        unit_price_cents=unit_price_cents,
        total_cents=unit_price_cents * quantity,
    )
    db.add(line)
    await db.flush()

    invoice = await get_invoice(invoice_id, db)
    if invoice:
        items = await get_invoice_line_items(invoice_id, db)
        invoice.total_amount_cents = sum(i.total_cents for i in items)
        await db.flush()

    return line


async def record_payment(
    invoice_id: UUID, body: PaymentCreate, received_by: UUID | None, db: AsyncSession
) -> Payment:
    payment = Payment(
        invoice_id=invoice_id,
        amount_cents=body.amount_cents,
        currency=body.currency,
        method=body.method,
        reference=body.reference,
        received_by_staff_id=received_by,
        received_at=datetime.now(tz=timezone.utc),
        notes=body.notes,
    )
    db.add(payment)
    await db.flush()

    invoice = await get_invoice(invoice_id, db)
    if invoice:
        invoice.paid_amount_cents += body.amount_cents
        if invoice.paid_amount_cents >= invoice.total_amount_cents:
            invoice.status = "paid"
        elif invoice.paid_amount_cents > 0:
            invoice.status = "partially_paid"
        await db.flush()

    return payment


async def get_billing_summary(db: AsyncSession) -> dict:
    revenue_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount_cents), 0))
    )
    total_revenue = revenue_result.scalar_one()

    outstanding_result = await db.execute(
        select(
            func.coalesce(
                func.sum(Invoice.total_amount_cents - Invoice.paid_amount_cents), 0
            )
        ).where(Invoice.status.in_(["issued", "partially_paid"]))
    )
    total_outstanding = outstanding_result.scalar_one()

    issued_result = await db.execute(
        select(func.count(Invoice.id)).where(Invoice.status != "draft")
    )
    invoices_issued = issued_result.scalar_one()

    paid_result = await db.execute(
        select(func.count(Invoice.id)).where(Invoice.status == "paid")
    )
    invoices_paid = paid_result.scalar_one()

    return {
        "total_revenue_cents": total_revenue,
        "total_outstanding_cents": total_outstanding,
        "invoices_issued": invoices_issued,
        "invoices_paid": invoices_paid,
        "currency": "GHS",
    }
