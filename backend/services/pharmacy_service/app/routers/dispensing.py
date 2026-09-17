"""Authenticated pharmacy reports and patient-owned dispensing history."""

import hashlib
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response
from pydantic import ValidationError
from shared.pharmacy_sync import DeliveryAck, DispensingEvent, authenticated, encode
from sqlalchemy import func, or_, select

from ..config import settings
from ..deps import CurrentPrincipal, DbSession
from ..models import (
    PharmacyDeployment,
    PharmacyPrescription,
    PharmacyPrescriptionEvent,
    PharmacyProfile,
)

router = APIRouter(tags=["pharmacy dispensing"])


async def bounded_body(request):
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > 256_000:
            raise HTTPException(413, "Event is too large.")
    return bytes(raw)


def original_lines(snapshot):
    return {
        item["prescription_item_id"]: (
            item["drug_name"],
            item["dosage_instructions"],
            item["quantity_prescribed"],
        )
        for item in snapshot["items"]
    }


@router.post("/v1/pharmacy-sync/events", response_model=DeliveryAck)
async def receive(
    request: Request,
    x_medapp_deployment: str | None = Header(default=None),
    x_medapp_timestamp: str | None = Header(default=None),
    x_medapp_signature: str | None = Header(default=None),
    db=DbSession,
):
    deployment = settings.pms_deployments.get(x_medapp_deployment)
    if deployment is None:
        raise HTTPException(401, "Invalid delivery credentials.")
    raw = await bounded_body(request)
    if not authenticated(
        raw, deployment.stock_secret.get_secret_value(), x_medapp_timestamp, x_medapp_signature
    ):
        raise HTTPException(401, "Invalid delivery credentials.")
    try:
        event = DispensingEvent.model_validate_json(raw)
    except ValidationError:
        raise HTTPException(422, "Invalid dispensing event.") from None
    # A deployment is permanently bound to one pharmacy. This lock also
    # serializes duplicate delivery and first-event insertion across workers.
    binding = await db.scalar(
        select(PharmacyDeployment)
        .where(PharmacyDeployment.deployment_key == x_medapp_deployment)
        .with_for_update()
    )
    pharmacy = await db.get(PharmacyProfile, event.pharmacy_id)
    if (
        not binding
        or not binding.activated_at
        or not pharmacy
        or not pharmacy.is_active
        or binding.pharmacy_id != event.pharmacy_id
        or event.deployment_key != x_medapp_deployment
    ):
        raise HTTPException(403, "Pharmacy deployment is unavailable.")
    payload = event.model_dump(mode="json")
    digest = hashlib.sha256(encode(payload)).hexdigest()
    previous = await db.get(PharmacyPrescriptionEvent, event.event_id)
    if previous:
        if previous.payload_hash != digest:
            raise HTTPException(409, "Event reference already has a different payload.")
        return previous.acknowledgement
    records = list(
        await db.scalars(
            select(PharmacyPrescription).where(
                PharmacyPrescription.pharmacy_id == event.pharmacy_id,
                or_(
                    PharmacyPrescription.pms_prescription_id == event.prescription_id,
                    PharmacyPrescription.external_ref == event.external_ref,
                ),
            )
        )
    )
    record = records[0] if records else None
    snapshot = event.snapshot.model_dump(mode="json")
    if record:
        if (
            len(records) != 1
            or record.patient_id != event.patient_id
            or record.pms_prescription_id != event.prescription_id
            or record.external_ref != event.external_ref
            or record.snapshot["rx_number"] != snapshot["rx_number"]
            or record.snapshot["prescriber_name"] != snapshot["prescriber_name"]
            or original_lines(record.snapshot) != original_lines(snapshot)
        ):
            raise HTTPException(409, "Prescription identity or original items changed.")
        collision = await db.scalar(
            select(PharmacyPrescriptionEvent.id).where(
                PharmacyPrescriptionEvent.prescription_id == record.id,
                PharmacyPrescriptionEvent.sequence == event.sequence,
            )
        )
        if collision:
            raise HTTPException(409, "Prescription sequence already has a different event.")
    applied = record is None or event.sequence > record.sequence
    if record is None:
        record = PharmacyPrescription(
            pharmacy_id=event.pharmacy_id,
            pms_prescription_id=event.prescription_id,
            patient_id=event.patient_id,
            external_ref=event.external_ref,
            sequence=event.sequence,
            snapshot=snapshot,
            occurred_at=event.occurred_at,
        )
        db.add(record)
        await db.flush()
    elif applied:
        record.sequence, record.snapshot, record.occurred_at = (
            event.sequence,
            snapshot,
            event.occurred_at,
        )
    ack = DeliveryAck(
        event_id=event.event_id,
        pharmacy_id=event.pharmacy_id,
        prescription_id=event.prescription_id,
        sequence=event.sequence,
        applied=applied,
    )
    db.add(
        PharmacyPrescriptionEvent(
            id=event.event_id,
            prescription_id=record.id,
            sequence=event.sequence,
            payload_hash=digest,
            payload=payload,
            acknowledgement=ack.model_dump(mode="json"),
        )
    )
    await db.commit()
    return ack


def patient_subject(principal):
    try:
        return UUID(principal.subject)
    except (ValueError, TypeError):
        raise HTTPException(401, "Invalid patient session.") from None


def serialize(record, pharmacy_name):
    return {
        "id": record.id,
        "pharmacy_id": record.pharmacy_id,
        "pharmacy_name": pharmacy_name,
        "sequence": record.sequence,
        "reported_at": record.occurred_at,
        "snapshot": record.snapshot,
    }


@router.get("/v1/me/pharmacy-prescriptions")
async def patient_history(
    response: Response,
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db=DbSession,
    principal=CurrentPrincipal,
):
    patient = patient_subject(principal)
    response.headers["Cache-Control"] = "private, no-store"
    query = (
        select(PharmacyPrescription, PharmacyProfile.name)
        .join(PharmacyProfile, PharmacyProfile.id == PharmacyPrescription.pharmacy_id)
        .where(PharmacyPrescription.patient_id == patient)
    )
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (
        await db.execute(
            query.order_by(PharmacyPrescription.updated_at.desc(), PharmacyPrescription.id.desc())
            .offset(offset)
            .limit(limit)
        )
    ).all()
    return {
        "items": [serialize(record, name) for record, name in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/v1/me/pharmacy-prescriptions/{record_id}")
async def patient_detail(
    record_id: UUID, response: Response, db=DbSession, principal=CurrentPrincipal
):
    row = (
        await db.execute(
            select(PharmacyPrescription, PharmacyProfile.name)
            .join(PharmacyProfile, PharmacyProfile.id == PharmacyPrescription.pharmacy_id)
            .where(
                PharmacyPrescription.id == record_id,
                PharmacyPrescription.patient_id == patient_subject(principal),
            )
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(404, "Prescription not found.")
    response.headers["Cache-Control"] = "private, no-store"
    return serialize(*row)
