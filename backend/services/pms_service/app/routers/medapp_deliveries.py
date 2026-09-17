from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select

from ..deps import DbSession, require_roles
from ..models.core import AuditLog, Prescription
from ..models.delivery import MedAppDelivery
from ..services import inventory_requests

router = APIRouter(prefix="/v1/prescriptions", tags=["MedApp delivery"])
PERMANENT = {"patient_link_missing", "workspace_unavailable", "snapshot_invalid"}


class DeliveryOut(BaseModel):
    id: UUID
    sequence: int
    kind: str
    state: str
    version: int
    attempts: int
    created_at: datetime
    next_attempt_at: datetime
    delivered_at: datetime | None
    last_error: str | None
    can_retry: bool


class DeliveryPage(BaseModel):
    items: list[DeliveryOut]
    total: int
    limit: int
    offset: int


class RetryDelivery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = Field(strict=True, ge=1)


def output(row):
    return DeliveryOut(
        **{
            key: getattr(row, key)
            for key in DeliveryOut.model_fields
            if key not in {"kind", "can_retry"}
        },
        kind=row.payload["kind"],
        can_retry=row.state in {"retry", "attention_required"} and row.last_error not in PERMANENT,
    )


@router.get("/{rx_id}/medapp-deliveries", response_model=DeliveryPage)
async def deliveries(
    rx_id: UUID,
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db=DbSession,
    _=Depends(require_roles("pharmacy_admin", "pharmacist", "cashier")),
):
    if await db.get(Prescription, rx_id) is None:
        raise HTTPException(404, "Prescription not found.")
    query = select(MedAppDelivery).where(MedAppDelivery.prescription_id == rx_id)
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = await db.scalars(
        query.order_by(MedAppDelivery.sequence.desc()).offset(offset).limit(limit)
    )
    return DeliveryPage(
        items=[output(row) for row in rows], total=total, limit=limit, offset=offset
    )


@router.post("/{rx_id}/medapp-deliveries/{event_id}/retry", response_model=DeliveryOut)
async def retry(
    rx_id: UUID,
    event_id: UUID,
    body: RetryDelivery,
    idempotency_key: UUID = Header(),
    db=DbSession,
    principal=Depends(require_roles("pharmacy_admin", "pharmacist")),
):
    actor = UUID(principal.subject)
    previous = await inventory_requests.begin_request(
        db,
        idempotency_key,
        actor,
        "medapp.retry:" + str(event_id),
        {"prescription_id": str(rx_id), **body.model_dump(mode="json")},
    )
    if previous is not None:
        return previous
    row = await db.scalar(
        select(MedAppDelivery)
        .where(MedAppDelivery.id == event_id, MedAppDelivery.prescription_id == rx_id)
        .with_for_update()
    )
    if row is None:
        raise HTTPException(404, "Delivery not found.")
    if row.version != body.version or not output(row).can_retry:
        raise HTTPException(
            409, "Delivery changed or cannot be retried. Reload its current status."
        )
    row.state, row.last_error, row.next_attempt_at = "pending", None, datetime.now(UTC)
    row.version += 1
    db.add(
        AuditLog(
            actor_staff_id=actor,
            action="medapp.delivery_retry",
            entity_type="prescription",
            entity_id=rx_id,
            payload_json={"event_id": str(event_id), "sequence": row.sequence},
        )
    )
    await db.flush()
    return await inventory_requests.finish_request(db, idempotency_key, output(row))
