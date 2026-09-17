"""Patient-locked clinical commands. Issued contents are never edited in place."""

import hashlib
import json
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from ..models import ClinicalPrescription as Rx
from ..models import Consent, PrescriptionDelivery, PrescriptionRequest
from ..schemas.prescription import PrescriptionItem, PrescriptionOut
from .record_service import _load_patient, _principal_uuid, record_access


async def authorize(db, principal, patient_user_id, *, write=False):
    patient = await _load_patient(db, patient_user_id)
    actor = _principal_uuid(principal)
    if write or actor != patient.user_id:
        if principal.role != "doctor" or actor == patient.user_id:
            raise HTTPException(403, "only a verified treating doctor may prescribe")
        consent = await db.scalar(
            select(Consent).where(
                Consent.patient_id == patient.id,
                Consent.doctor_user_id == actor,
                Consent.scope == "records_and_prescriptions",
                Consent.revoked_at.is_(None),
                or_(Consent.expires_at.is_(None), Consent.expires_at > datetime.now(UTC)),
            )
        )
        if consent is None:
            raise HTTPException(
                403, "the patient must grant prescribing permission in care team sharing"
            )
    return patient


async def load(db, patient, actor, rx_id):
    rx = await db.scalar(
        select(Rx)
        .where(Rx.id == rx_id, Rx.patient_id == patient.id)
        .execution_options(populate_existing=True)
    )
    if rx is None or (rx.issued_at is None and rx.author_id != actor):
        raise HTTPException(404, "prescription not found")
    return rx


async def output(db, patient, rx):
    deliveries = list(
        await db.scalars(
            select(PrescriptionDelivery)
            .where(PrescriptionDelivery.prescription_id == rx.id)
            .order_by(PrescriptionDelivery.created_at, PrescriptionDelivery.id)
        )
    )
    replacement = await db.scalar(select(Rx.id).where(Rx.replaces_id == rx.id))
    return PrescriptionOut(
        id=rx.id,
        patient_user_id=patient.user_id,
        author_id=rx.author_id,
        prescriber_name=rx.prescriber_name,
        version=rx.version,
        status=rx.status,
        items=rx.items,
        clinical_goal=rx.clinical_goal,
        valid_until=rx.valid_until,
        issued_at=rx.issued_at,
        cancelled_at=rx.cancelled_at,
        created_at=rx.created_at,
        change_reason=rx.change_reason,
        replaces_id=rx.replaces_id,
        replacement_id=replacement,
        pharmacy_id=rx.pharmacy_id,
        deliveries=[
            {
                "id": d.id,
                "operation": d.operation,
                "state": d.state,
                "attempts": d.attempts,
                "error_code": d.error_code,
            }
            for d in deliveries
        ],
    )


def check_date(valid_until):
    today = datetime.now(UTC).date()
    if not today <= valid_until <= today + timedelta(days=365):
        raise HTTPException(422, "valid until must be today or within the next 365 days")


async def begin_request(db, request_id, actor, patient, rx_id, operation, payload):
    digest = hashlib.sha256(
        json.dumps(
            [str(patient.user_id), str(rx_id), operation, payload.model_dump(mode="json")],
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()
    insert = sqlite_insert if db.bind.dialect.name == "sqlite" else pg_insert
    inserted = await db.scalar(
        insert(PrescriptionRequest)
        .values(
            id=request_id,
            actor_id=actor,
            request_hash=digest,
        )
        .on_conflict_do_nothing(index_elements=[PrescriptionRequest.id])
        .returning(PrescriptionRequest.id)
    )
    if inserted:
        return None
    previous = await db.get(PrescriptionRequest, request_id)
    if previous.actor_id != actor or previous.request_hash != digest or previous.response is None:
        raise HTTPException(409, "request reference conflicts; reload before making a new change")
    return previous.response


async def enqueue(db, patient, rx, operation):
    payload = {
        "prescription_id": str(rx.id),
        "pharmacy_id": str(rx.pharmacy_id),
        "patient_id": str(patient.user_id),
        "operation": operation,
    }
    if operation == "send":
        payload["prescription"] = {
            "external_ref": str(rx.id),
            "prescriber_name": rx.prescriber_name[:255],
            "customer_medapp_user_id": str(patient.user_id),
            "items": [
                {
                    "drug_name": i.drug_name,
                    "strength": i.strength,
                    "form": i.form,
                    "quantity_prescribed": i.quantity,
                    "dosage_instructions": i.dispensing_instructions(),
                }
                for i in map(PrescriptionItem.model_validate, rx.items)
            ],
        }
        payload["valid_until"] = rx.valid_until.isoformat()
    db.add(
        PrescriptionDelivery(
            prescription_id=rx.id,
            operation=operation,
            payload=payload,
            state="queued",
            next_attempt_at=datetime.now(UTC),
        )
    )


async def command(db, principal, patient_user_id, rx_id, operation, payload, request_id, doctor):
    patient = await authorize(db, principal, patient_user_id, write=True)
    actor = _principal_uuid(principal)
    if doctor.user_id != actor:
        raise HTTPException(403, "doctor identity does not match this account")
    previous = await begin_request(db, request_id, actor, patient, rx_id, operation, payload)
    if previous is not None:
        return previous
    if operation == "create":
        check_date(payload.valid_until)
        rx = Rx(
            patient_id=patient.id,
            author_id=actor,
            approval_id=doctor.approval_id,
            prescriber_name=doctor.display_name,
            **payload.model_dump(mode="json"),
        )
        rx.valid_until = payload.valid_until
        db.add(rx)
    else:
        rx = await load(db, patient, actor, rx_id)
        if rx.author_id != actor:
            raise HTTPException(403, "only the issuing doctor can change this prescription")
        if rx.version != payload.version:
            raise HTTPException(409, "prescription changed; reload before continuing")
        if operation == "update":
            if rx.status != "draft":
                raise HTTPException(409, "issued prescription contents cannot be edited")
            check_date(payload.valid_until)
            rx.items = [i.model_dump(mode="json") for i in payload.items]
            rx.clinical_goal, rx.valid_until = payload.clinical_goal, payload.valid_until
        elif operation == "issue":
            if rx.status != "draft":
                raise HTTPException(409, "only a draft can be issued")
            check_date(rx.valid_until)
            rx.status, rx.issued_at = "issued", datetime.now(UTC)
            rx.approval_id, rx.prescriber_name = doctor.approval_id, doctor.display_name
        elif operation == "cancel":
            if rx.status not in {"draft", "issued"}:
                raise HTTPException(409, "this prescription is already withdrawn")
            rx.status, rx.cancelled_at, rx.change_reason = (
                "cancelled",
                datetime.now(UTC),
                payload.reason,
            )
            if rx.pharmacy_id:
                await enqueue(db, patient, rx, "cancel")
        elif operation == "correct":
            if rx.status not in {"issued", "cancelled"}:
                raise HTTPException(409, "only an issued or cancelled prescription can be replaced")
            if await db.scalar(select(Rx.id).where(Rx.replaces_id == rx.id)):
                raise HTTPException(409, "a replacement draft already exists")
            if rx.pharmacy_id:
                cancellation = await db.scalar(
                    select(PrescriptionDelivery).where(
                        PrescriptionDelivery.prescription_id == rx.id,
                        PrescriptionDelivery.operation == "cancel",
                    )
                )
                if cancellation is None or cancellation.state != "delivered":
                    raise HTTPException(
                        409, "cancel and confirm pharmacy withdrawal before preparing a replacement"
                    )
            rx.status, rx.cancelled_at, rx.change_reason = (
                "superseded",
                rx.cancelled_at or datetime.now(UTC),
                payload.reason,
            )
            rx.version += 1
            await db.flush()
            rx = Rx(
                patient_id=patient.id,
                author_id=actor,
                approval_id=doctor.approval_id,
                prescriber_name=doctor.display_name,
                items=rx.items,
                clinical_goal=rx.clinical_goal,
                valid_until=rx.valid_until,
                replaces_id=rx.id,
                change_reason=payload.reason,
            )
            db.add(rx)
        elif operation == "route":
            if rx.status != "issued" or rx.pharmacy_id is not None:
                raise HTTPException(409, "only an issued, unrouted prescription can be sent")
            check_date(rx.valid_until)
            rx.pharmacy_id = payload.pharmacy_id
            await enqueue(db, patient, rx, "send")
        elif operation == "retry":
            deliveries = list(
                await db.scalars(
                    select(PrescriptionDelivery)
                    .where(
                        PrescriptionDelivery.prescription_id == rx.id,
                        PrescriptionDelivery.state == "attention",
                    )
                    .with_for_update()
                )
            )
            if not deliveries:
                raise HTTPException(409, "no delivery needs retry")
            for delivery in deliveries:
                delivery.state, delivery.error_code = "queued", None
                delivery.next_attempt_at = datetime.now(UTC)
        else:
            raise HTTPException(400, "unsupported prescription command")
        if operation != "correct":
            rx.version += 1
    await db.flush()
    await record_access(
        db,
        actor,
        patient.id,
        f"prescription_{operation}",
        f"{rx.id}; approval {doctor.approval_id}",
        mode="consent",
    )
    result = (await output(db, patient, rx)).model_dump(mode="json")
    receipt = await db.get(PrescriptionRequest, request_id)
    receipt.response = result
    await db.commit()
    return result
