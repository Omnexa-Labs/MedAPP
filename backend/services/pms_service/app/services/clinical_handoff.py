import hashlib
from datetime import UTC, datetime

from fastapi import HTTPException
from shared.clinical_handoff import ClinicalHandoffAck
from shared.pharmacy_sync import encode
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from ..config import settings
from ..models.clinical_handoff import ClinicalHandoffReceipt
from ..models.core import Prescription
from ..models.workspace import MedAppWorkspace
from ..schemas.integrations import MedAppPrescriptionWebhook
from . import medapp_delivery, medapp_integration


async def receive(db, command):
    await medapp_integration.external_lock(db, command.prescription_id)
    workspace = await db.scalar(select(MedAppWorkspace).with_for_update())
    if (
        not workspace
        or not workspace.is_active
        or workspace.pharmacy_id != command.pharmacy_id
        or workspace.deployment_key != settings.medapp_deployment_key
    ):
        raise HTTPException(409, "pharmacy workspace does not match this prescription")
    insert = sqlite_insert if db.bind.dialect.name == "sqlite" else pg_insert
    await db.execute(
        insert(ClinicalHandoffReceipt)
        .values(
            id=command.prescription_id,
            patient_id=command.patient_id,
            pharmacy_id=command.pharmacy_id,
        )
        .on_conflict_do_nothing(index_elements=[ClinicalHandoffReceipt.id])
    )
    receipt = await db.scalar(
        select(ClinicalHandoffReceipt)
        .where(ClinicalHandoffReceipt.id == command.prescription_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if receipt.patient_id != command.patient_id or receipt.pharmacy_id != command.pharmacy_id:
        raise HTTPException(409, "prescription identity conflicts")
    if command.operation == "send":
        digest = hashlib.sha256(encode(command.model_dump(mode="json"))).hexdigest()
        if receipt.send_ack:
            if receipt.payload_hash != digest:
                raise HTTPException(409, "issued prescription contents conflict")
            return receipt.send_ack
        if receipt.cancel_ack:
            raise HTTPException(409, "this prescription was withdrawn before delivery")
        if command.valid_until < datetime.now(UTC).date():
            raise HTTPException(422, "this prescription has expired")
        payload = MedAppPrescriptionWebhook.model_validate(
            {
                **command.prescription.model_dump(mode="json"),
                "valid_until": command.valid_until,
            }
        )
        result = await medapp_integration.ingest_prescription(payload, db, commit=False)
        ack = ClinicalHandoffAck(
            prescription_id=command.prescription_id,
            pharmacy_id=command.pharmacy_id,
            operation="send",
            pms_prescription_id=result["prescription_id"],
            accepted_item_count=result["accepted_item_count"],
        ).model_dump(mode="json")
        receipt.payload_hash, receipt.send_ack = digest, ack
    else:
        if receipt.cancel_ack:
            return receipt.cancel_ack
        rx = await db.scalar(
            select(Prescription)
            .where(
                Prescription.source == "medapp",
                Prescription.external_ref == str(command.prescription_id),
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if rx:
            if rx.medapp_patient_id != command.patient_id:
                raise HTTPException(409, "prescription patient identity conflicts")
            if rx.status != "cancelled":
                # Close remaining dispensing; supplied quantities and stock stay intact.
                rx.status, rx.cancellation_reason = "cancelled", "Withdrawn by the issuing doctor"
                rx.version += 1
                await medapp_delivery.enqueue(db, rx, "cancelled")
        ack = ClinicalHandoffAck(
            prescription_id=command.prescription_id,
            pharmacy_id=command.pharmacy_id,
            operation="cancel",
            pms_prescription_id=rx.id if rx else None,
            accepted_item_count=0,
        ).model_dump(mode="json")
        # A durable tombstone rejects even a delayed first delivery of the old prescription.
        receipt.cancel_ack = ack
    await db.commit()
    return ack
