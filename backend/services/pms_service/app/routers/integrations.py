from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..deps import DbSession, require_roles
from ..models.core import Drug, DrugBatch
from ..schemas.integrations import (
    MedAppPrescriptionWebhook,
    MedAppWebhookAck,
    StockAvailabilityResponse,
    StockAvailabilityRow,
)
from ..services import inventory_service, medapp_integration

router = APIRouter(prefix="/v1/integrations", tags=["integrations"])


@router.post(
    "/medapp/prescriptions",
    response_model=MedAppWebhookAck,
    status_code=status.HTTP_201_CREATED,
)
async def medapp_prescription_webhook(
    request: Request,
    x_medapp_signature: str | None = Header(default=None),
    db: AsyncSession = DbSession,
):
    raw = await request.body()
    if not medapp_integration.verify_signature(raw, x_medapp_signature):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid signature")
    try:
        payload = MedAppPrescriptionWebhook.model_validate_json(raw)
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"invalid payload: {exc}")
    result = await medapp_integration.ingest_prescription(payload, db)
    return MedAppWebhookAck(**result)


@router.get(
    "/medapp/stock-availability",
    response_model=StockAvailabilityResponse,
)
async def stock_availability(
    drug_name: str | None = Query(default=None),
    db: AsyncSession = DbSession,
    _=Depends(require_roles("pharmacy_admin", "pharmacist", "cashier")),
):
    """Stock availability read endpoint.

    Auth-gated for now (PMS staff). When MedApp wires in for real, swap the
    dependency for a partner-token / IP-allowlist check.
    """
    stmt = select(Drug).where(Drug.is_active.is_(True))
    if drug_name:
        like = f"%{drug_name.lower()}%"
        from sqlalchemy import func, or_

        stmt = stmt.where(
            or_(
                func.lower(Drug.name).like(like),
                func.lower(Drug.brand_name).like(like),
            )
        )
    drugs = list((await db.execute(stmt)).scalars().all())
    stock = await inventory_service.stock_map([d.id for d in drugs], db)

    # For pricing we surface the oldest non-expired batch's selling_price
    # so callers get the price the next dispense would actually use.
    rows: list[StockAvailabilityRow] = []
    for d in drugs:
        batches = await inventory_service.fifo_batches(d.id, db)
        price = batches[0].selling_price_cents if batches else d.default_selling_price_cents
        rows.append(
            StockAvailabilityRow(
                drug_id=d.id,
                drug_name=d.name,
                quantity_on_hand=stock.get(d.id, 0),
                selling_price_cents=price,
                currency=d.currency,
                requires_prescription=d.requires_prescription,
            )
        )
    return StockAvailabilityResponse(
        pharmacy_slug=settings.pharmacy_slug,
        items=rows,
    )
