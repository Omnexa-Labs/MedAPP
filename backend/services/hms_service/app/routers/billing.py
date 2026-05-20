from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import HmsPrincipal, get_tenant_db, require_hms_roles
from ..schemas.billing import (
    BillingSummaryOut,
    InvoiceCreate,
    InvoiceLineItemCreate,
    InvoiceLineItemOut,
    InvoiceList,
    InvoiceOut,
    InvoiceUpdate,
    PaymentCreate,
    PaymentOut,
)
from ..services import billing_service

router = APIRouter(prefix="/v1", tags=["billing"])

BILLING_ROLES = ("hospital_admin", "billing_clerk")


@router.post("/invoices", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
async def create_invoice(
    body: InvoiceCreate,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*BILLING_ROLES)),
):
    invoice = await billing_service.create_invoice(body, UUID(principal.subject), db)
    line_items = await billing_service.get_invoice_line_items(invoice.id, db)
    return InvoiceOut(
        invoice_id=invoice.id,
        visit_id=invoice.visit_id,
        patient_id=invoice.patient_id,
        invoice_number=invoice.invoice_number,
        status=invoice.status,
        total_amount_cents=invoice.total_amount_cents,
        paid_amount_cents=invoice.paid_amount_cents,
        currency=invoice.currency,
        issued_at=invoice.issued_at,
        due_at=invoice.due_at,
        notes=invoice.notes,
        created_by_staff_id=invoice.created_by_staff_id,
        line_items=line_items,
        created_at=invoice.created_at,
        updated_at=invoice.updated_at,
    )


@router.get("/invoices", response_model=InvoiceList)
async def list_invoices(
    patient_id: UUID | None = Query(default=None),
    inv_status: str | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*BILLING_ROLES)),
):
    invoices = await billing_service.list_invoices(db, patient_id, inv_status)
    result = []
    for inv in invoices:
        items = await billing_service.get_invoice_line_items(inv.id, db)
        result.append(InvoiceOut(
            invoice_id=inv.id,
            visit_id=inv.visit_id,
            patient_id=inv.patient_id,
            invoice_number=inv.invoice_number,
            status=inv.status,
            total_amount_cents=inv.total_amount_cents,
            paid_amount_cents=inv.paid_amount_cents,
            currency=inv.currency,
            issued_at=inv.issued_at,
            due_at=inv.due_at,
            notes=inv.notes,
            created_by_staff_id=inv.created_by_staff_id,
            line_items=items,
            created_at=inv.created_at,
            updated_at=inv.updated_at,
        ))
    return InvoiceList(items=result)


@router.get("/invoices/{invoice_id}", response_model=InvoiceOut)
async def get_invoice(
    invoice_id: UUID,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*BILLING_ROLES)),
):
    invoice = await billing_service.get_invoice(invoice_id, db)
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "invoice not found")
    items = await billing_service.get_invoice_line_items(invoice_id, db)
    return InvoiceOut(
        invoice_id=invoice.id,
        visit_id=invoice.visit_id,
        patient_id=invoice.patient_id,
        invoice_number=invoice.invoice_number,
        status=invoice.status,
        total_amount_cents=invoice.total_amount_cents,
        paid_amount_cents=invoice.paid_amount_cents,
        currency=invoice.currency,
        issued_at=invoice.issued_at,
        due_at=invoice.due_at,
        notes=invoice.notes,
        created_by_staff_id=invoice.created_by_staff_id,
        line_items=items,
        created_at=invoice.created_at,
        updated_at=invoice.updated_at,
    )


@router.patch("/invoices/{invoice_id}", response_model=InvoiceOut)
async def update_invoice(
    invoice_id: UUID,
    body: InvoiceUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*BILLING_ROLES)),
):
    invoice = await billing_service.update_invoice(invoice_id, body, db)
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "invoice not found")
    items = await billing_service.get_invoice_line_items(invoice_id, db)
    return InvoiceOut(
        invoice_id=invoice.id,
        visit_id=invoice.visit_id,
        patient_id=invoice.patient_id,
        invoice_number=invoice.invoice_number,
        status=invoice.status,
        total_amount_cents=invoice.total_amount_cents,
        paid_amount_cents=invoice.paid_amount_cents,
        currency=invoice.currency,
        issued_at=invoice.issued_at,
        due_at=invoice.due_at,
        notes=invoice.notes,
        created_by_staff_id=invoice.created_by_staff_id,
        line_items=items,
        created_at=invoice.created_at,
        updated_at=invoice.updated_at,
    )


@router.post("/invoices/{invoice_id}/items", response_model=InvoiceLineItemOut, status_code=status.HTTP_201_CREATED)
async def add_line_item(
    invoice_id: UUID,
    body: InvoiceLineItemCreate,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*BILLING_ROLES)),
):
    return await billing_service.add_line_item(
        invoice_id, body.description, body.category, body.quantity, body.unit_price_cents, db
    )


@router.post("/invoices/{invoice_id}/payments", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
async def record_payment(
    invoice_id: UUID,
    body: PaymentCreate,
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*BILLING_ROLES)),
):
    return await billing_service.record_payment(invoice_id, body, UUID(principal.subject), db)


@router.get("/billing/summary", response_model=BillingSummaryOut)
async def billing_summary(
    db: AsyncSession = Depends(get_tenant_db),
    principal: HmsPrincipal = Depends(require_hms_roles(*BILLING_ROLES)),
):
    summary = await billing_service.get_billing_summary(db)
    return BillingSummaryOut(**summary)
