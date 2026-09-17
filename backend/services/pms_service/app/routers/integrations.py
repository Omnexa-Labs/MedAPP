from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..deps import DbSession, get_principal
from ..models.core import Drug
from ..models.workspace import MedAppWorkspace
from ..schemas.integrations import (
    MedAppPrescriptionWebhook,
    MedAppWebhookAck,
    StockAvailabilityResponse,
    StockAvailabilityRow,
)
from ..services import inventory_service, medapp_integration

_PARTNER_STOCK_ROLES = {"pharmacy_admin", "pharmacist", "cashier"}


async def _require_partner_or_staff(
    request: Request,
    x_medapp_signature: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
    db: AsyncSession = DbSession,
) -> None:
    """Accept EITHER a valid MedApp partner-token signature OR a
    pharmacy-staff JWT in one of the stock-read roles.

    Partner signature is preferred — it's the path the MedApp directory
    uses. The staff path keeps the legacy in-app stock-check page (PMS
    UI) working. If both headers are present, we try the signature
    first; falling through to JWT means a stale signature won't break
    a staff session that's also authenticated.
    """
    if x_medapp_signature:
        # Canonical form must include the query string. Starlette's
        # `request.url.path` excludes it; build the path+query manually.
        raw_query = request.url.query or ""
        path_with_query = request.url.path + (f"?{raw_query}" if raw_query else "")
        body = await request.body()
        if medapp_integration.verify_partner_signature(
            request.method, path_with_query, body, x_medapp_signature
        ):
            return
    if authorization:
        # Fall through to the existing JWT path — re-uses the same role
        # constraints the route had before partner tokens were added.
        principal = await get_principal(authorization=authorization, db=db)
        if principal.role in _PARTNER_STOCK_ROLES:
            return
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"requires one of {sorted(_PARTNER_STOCK_ROLES)}, got '{principal.role}'",
        )
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing partner signature or bearer token")


router = APIRouter(prefix="/v1/integrations", tags=["integrations"])
PartnerOrStaff = Depends(_require_partner_or_staff)


@router.post("/medapp/clinical-prescriptions")
async def clinical_prescription_handoff(request: Request,
    x_medapp_signature: str | None = Header(default=None), db: AsyncSession = DbSession):
    from shared.clinical_handoff import ClinicalHandoff
    from ..services.clinical_handoff import receive
    chunks = bytearray()
    async for chunk in request.stream():
        chunks.extend(chunk)
        if len(chunks) > 64_000:
            raise HTTPException(413, "prescription payload is too large")
    raw = bytes(chunks)
    if not medapp_integration.verify_partner_signature("POST", request.url.path, raw, x_medapp_signature):
        raise HTTPException(401, "invalid partner signature")
    try:
        command = ClinicalHandoff.model_validate_json(raw)
    except ValueError as exc:
        raise HTTPException(422, "invalid clinical prescription payload") from exc
    return await receive(db, command)


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
    chunks = bytearray()
    async for chunk in request.stream():
        chunks.extend(chunk)
        if len(chunks) > 256_000:
            raise HTTPException(413, "Prescription payload is too large.")
    raw = bytes(chunks)
    if not medapp_integration.verify_signature(raw, x_medapp_signature):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid signature")
    try:
        payload = MedAppPrescriptionWebhook.model_validate_json(raw)
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid prescription payload.") from exc
    result = await medapp_integration.ingest_prescription(payload, db)
    return MedAppWebhookAck(**result)


@router.get(
    "/medapp/stock-availability",
    response_model=StockAvailabilityResponse,
)
async def stock_availability(
    drug_name: str | None = Query(default=None),
    db: AsyncSession = DbSession,
    _=PartnerOrStaff,
):
    """Stock availability read endpoint.

    Accepts either a MedApp partner-token signature (X-MedApp-Signature
    over METHOD\\npath?query\\nbody, HMAC-SHA256 with the shared MedApp
    webhook secret) OR a pharmacy-staff JWT in one of {pharmacy_admin,
    pharmacist, cashier}. See `_require_partner_or_staff`.
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
    workspace = await db.scalar(select(MedAppWorkspace))
    if workspace and (
        not workspace.is_active or workspace.deployment_key != settings.medapp_deployment_key
    ):
        raise HTTPException(404, "pharmacy workspace is unavailable")
    return StockAvailabilityResponse(
        pharmacy_id=workspace.pharmacy_id if workspace else None,
        pharmacy_slug=f"pharmacy-{workspace.pharmacy_id.hex}"
        if workspace
        else settings.pharmacy_slug,
        items=rows,
    )
