from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import func, select

from ..deps import DbSession, require_roles
from ..models.core import AuditLog, Prescription, PrescriptionItem
from ..schemas.prescriptions import (
    DispenseRequest,
    DispenseResult,
    PrescriptionCreate,
    PrescriptionItemOut,
    PrescriptionList,
    PrescriptionOut,
)
from ..schemas.transactions import CancelTransaction, TransactionQuote
from ..services import (
    dispensing_service,
    inventory_service,
    medapp_delivery,
    transaction_pricing,
)
from ..services import inventory_requests as requests

router = APIRouter(prefix="/v1/prescriptions", tags=["prescriptions"])
ALL = ("pharmacy_admin", "pharmacist", "cashier")
EDIT = ("pharmacy_admin", "pharmacist")


async def serialize(rows, db):
    grouped = {rx.id: [] for rx in rows}
    if grouped:
        for item in await db.scalars(
            select(PrescriptionItem)
            .where(PrescriptionItem.prescription_id.in_(grouped))
            .order_by(PrescriptionItem.created_at, PrescriptionItem.id)
        ):
            grouped[item.prescription_id].append(PrescriptionItemOut.model_validate(item))
    return [
        PrescriptionOut(
            **{key: getattr(rx, key) for key in PrescriptionOut.model_fields if key != "items"},
            items=grouped[rx.id],
        )
        for rx in rows
    ]


@router.get("", response_model=PrescriptionList)
async def list_prescriptions(
    rx_status: str | None = Query(
        None, alias="status", pattern="^(pending|partially_dispensed|dispensed|cancelled)$"
    ),
    source: str | None = Query(None, pattern="^(walk_in|internal|medapp)$"),
    search: str | None = Query(None, max_length=128),
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db=DbSession,
    _=Depends(require_roles(*ALL)),
):
    stmt = select(Prescription)
    if rx_status:
        stmt = stmt.where(Prescription.status == rx_status)
    if source:
        stmt = stmt.where(Prescription.source == source)
    if search and search.strip():
        stmt = stmt.where(
            func.lower(Prescription.rx_number).contains(search.strip().lower(), autoescape=True)
        )
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = list(
        await db.scalars(
            stmt.order_by(Prescription.created_at.desc(), Prescription.id.desc())
            .offset(offset)
            .limit(limit)
        )
    )
    return PrescriptionList(
        items=await serialize(rows, db), total=total, limit=limit, offset=offset
    )


@router.post("", response_model=PrescriptionOut, status_code=201)
async def create_prescription(
    body: PrescriptionCreate,
    idempotency_key: UUID = Header(),
    db=DbSession,
    principal=Depends(require_roles(*EDIT)),
):
    actor = UUID(principal.subject)
    previous = await requests.begin_request(
        db, idempotency_key, actor, "prescription.create", body.model_dump(mode="json")
    )
    if previous is not None:
        return previous
    await transaction_pricing.check_customer(body.customer_id, db)
    drugs = await inventory_service.lock_drugs(db, [line.drug_id for line in body.items])
    currency = await inventory_service.pharmacy_currency(db)
    if any(
        line.drug_id not in drugs
        or not drugs[line.drug_id].is_active
        or drugs[line.drug_id].currency != currency
        for line in body.items
    ):
        raise HTTPException(
            400, "Prescription items must be active drugs in the pharmacy currency."
        )
    rx = Prescription(
        rx_number="RX-" + uuid4().hex[:24], status="pending", **body.model_dump(exclude={"items"})
    )
    db.add(rx)
    await db.flush()
    for item in body.items:
        db.add(
            PrescriptionItem(
                prescription_id=rx.id,
                drug_id=item.drug_id,
                drug_name_snapshot=drugs[item.drug_id].name,
                quantity_prescribed=item.quantity_prescribed,
                dosage_instructions=item.dosage_instructions,
            )
        )
    await db.flush()
    result = (await serialize([rx], db))[0]
    db.add(
        AuditLog(
            actor_staff_id=actor,
            action="prescription.created",
            entity_type="prescription",
            entity_id=rx.id,
            payload_json=result.model_dump(mode="json"),
        )
    )
    return await requests.finish_request(db, idempotency_key, result)


@router.get("/{rx_id}", response_model=PrescriptionOut)
async def get_prescription(rx_id: UUID, db=DbSession, _=Depends(require_roles(*ALL))):
    rx = await db.get(Prescription, rx_id)
    if rx is None:
        raise HTTPException(404, "Prescription not found.")
    return (await serialize([rx], db))[0]


@router.post("/{rx_id}/quote", response_model=TransactionQuote)
async def quote_dispense(
    rx_id: UUID, body: DispenseRequest, db=DbSession, _=Depends(require_roles(*EDIT))
):
    return (await dispensing_service.prepare(rx_id, body, db))[3]


@router.post("/{rx_id}/dispense", response_model=DispenseResult)
async def dispense(
    rx_id: UUID,
    body: DispenseRequest,
    idempotency_key: UUID = Header(),
    db=DbSession,
    principal=Depends(require_roles(*EDIT)),
):
    actor = UUID(principal.subject)
    previous = await requests.begin_request(
        db,
        idempotency_key,
        actor,
        "prescription.dispense:" + str(rx_id),
        body.model_dump(mode="json"),
    )
    if previous is not None:
        return previous
    data = await dispensing_service.dispense(rx_id, body, actor, db)
    result = DispenseResult(**data)
    db.add(
        AuditLog(
            actor_staff_id=actor,
            action="prescription.dispensed",
            entity_type="prescription",
            entity_id=rx_id,
            payload_json={**result.model_dump(mode="json"), "notes": body.notes},
        )
    )
    await requests.finish_request(db, idempotency_key, result)
    return result


@router.post("/{rx_id}/cancel", response_model=PrescriptionOut)
async def cancel_prescription(
    rx_id: UUID,
    body: CancelTransaction,
    idempotency_key: UUID = Header(),
    db=DbSession,
    principal=Depends(require_roles(*EDIT)),
):
    actor = UUID(principal.subject)
    previous = await requests.begin_request(
        db,
        idempotency_key,
        actor,
        "prescription.cancel:" + str(rx_id),
        body.model_dump(mode="json"),
    )
    if previous is not None:
        return previous
    rx = await db.scalar(select(Prescription).where(Prescription.id == rx_id).with_for_update())
    if rx is None:
        raise HTTPException(404, "Prescription not found.")
    if rx.version != body.version:
        raise HTTPException(409, "This prescription changed. Reload before cancelling.")
    if rx.status not in ("pending", "partially_dispensed"):
        raise HTTPException(400, f"Prescription is {rx.status}.")
    rx.status = "cancelled"
    rx.version += 1
    rx.cancellation_reason = body.reason
    await db.flush()
    await medapp_delivery.enqueue(db, rx, "cancelled")
    result = (await serialize([rx], db))[0]
    db.add(
        AuditLog(
            actor_staff_id=actor,
            action="prescription.cancelled",
            entity_type="prescription",
            entity_id=rx_id,
            payload_json=result.model_dump(mode="json"),
        )
    )
    return await requests.finish_request(db, idempotency_key, result)
