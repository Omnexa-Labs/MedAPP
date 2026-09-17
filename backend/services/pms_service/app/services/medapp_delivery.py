"""Transactional snapshots and leased delivery; never perform HTTP under row locks."""

import time
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
from pydantic import ValidationError
from shared.pharmacy_sync import DeliveryAck, DispensingEvent, encode, sign
from sqlalchemy import and_, func, or_, select

from ..config import settings
from ..models.core import PrescriptionItem, SaleCorrection, SaleCorrectionItem, SaleItem
from ..models.delivery import MedAppDelivery
from ..models.workspace import MedAppWorkspace

MAX_ATTEMPTS = 12


async def enqueue(db, rx, kind, *, disposition=None):
    """The caller owns the prescription lock and commits this with its local change."""
    if rx is None or rx.source != "medapp":
        return
    await db.flush()
    workspace = await db.scalar(select(MedAppWorkspace))
    items = list(
        await db.scalars(
            select(PrescriptionItem)
            .where(PrescriptionItem.prescription_id == rx.id)
            .order_by(PrescriptionItem.id)
        )
    )
    returned = dict(
        (
            await db.execute(
                select(SaleItem.prescription_item_id, func.sum(SaleCorrectionItem.quantity))
                .join(SaleCorrectionItem, SaleCorrectionItem.sale_item_id == SaleItem.id)
                .join(SaleCorrection, SaleCorrection.id == SaleCorrectionItem.correction_id)
                .where(
                    SaleItem.prescription_item_id.in_([item.id for item in items]),
                    SaleCorrection.kind == "customer_return",
                )
                .group_by(SaleItem.prescription_item_id)
            )
        ).all()
    )
    event_id, now = uuid4(), datetime.now(UTC)
    rx.sync_sequence += 1
    payload = {
        "schema_version": 1,
        "event_id": str(event_id),
        "deployment_key": workspace.deployment_key if workspace else settings.medapp_deployment_key,
        "pharmacy_id": str(workspace.pharmacy_id) if workspace else None,
        "prescription_id": str(rx.id),
        "external_ref": rx.external_ref,
        "patient_id": str(rx.medapp_patient_id) if rx.medapp_patient_id else None,
        "sequence": rx.sync_sequence,
        "kind": kind,
        "occurred_at": now.isoformat(),
        "disposition": disposition,
        "snapshot": {
            "rx_number": rx.rx_number,
            "rx_version": rx.version,
            "status": rx.status,
            "prescriber_name": rx.prescriber_name,
            "items": [
                {
                    "prescription_item_id": str(item.id),
                    "drug_name": item.drug_name_snapshot,
                    "dosage_instructions": item.dosage_instructions,
                    "quantity_prescribed": item.quantity_prescribed,
                    "quantity_dispensed": item.quantity_dispensed,
                    "quantity_returned": returned.get(item.id, 0),
                }
                for item in items
            ],
        },
    }
    error = None
    if not rx.medapp_patient_id:
        error = "patient_link_missing"
    elif not workspace or not workspace.is_active:
        error = "workspace_unavailable"
    else:
        try:
            DispensingEvent.model_validate(payload)
        except ValidationError:
            error = "snapshot_invalid"
    db.add(
        MedAppDelivery(
            id=event_id,
            prescription_id=rx.id,
            sequence=rx.sync_sequence,
            payload=payload,
            next_attempt_at=now,
            state="attention_required" if error else "pending",
            last_error=error,
        )
    )
    await db.flush()


async def claim(session_factory):
    now = datetime.now(UTC)
    async with session_factory() as db:
        row = await db.scalar(
            select(MedAppDelivery)
            .where(
                or_(
                    and_(
                        MedAppDelivery.state.in_(["pending", "retry"]),
                        MedAppDelivery.next_attempt_at <= now,
                    ),
                    and_(MedAppDelivery.state == "sending", MedAppDelivery.leased_until <= now),
                )
            )
            .order_by(MedAppDelivery.next_attempt_at, MedAppDelivery.id)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if row is None:
            return None
        row.state, row.lease_token = "sending", uuid4()
        row.leased_until = now + timedelta(seconds=60)
        row.attempts += 1
        row.version += 1
        result = row.id, row.lease_token, row.payload, row.attempts
        await db.commit()
        return result


async def transmit(client, payload):
    try:
        event = DispensingEvent.model_validate(payload)
    except ValidationError:
        return "attention_required", "snapshot_invalid"
    if not settings.medapp_sync_url or len(settings.medapp_webhook_secret) < 32:
        return "attention_required", "sync_not_configured"
    if event.deployment_key != settings.medapp_deployment_key:
        return "attention_required", "deployment_mismatch"
    raw, timestamp = encode(payload), str(int(time.time()))
    try:
        response = await client.post(
            settings.medapp_sync_url,
            content=raw,
            headers={
                "Content-Type": "application/json",
                "X-MedApp-Deployment": event.deployment_key,
                "X-MedApp-Timestamp": timestamp,
                "X-MedApp-Signature": sign(raw, settings.medapp_webhook_secret, timestamp),
            },
        )
    except httpx.RequestError:
        return "retry", "transport_unavailable"
    if response.status_code in {408, 425, 429} or response.status_code >= 500:
        return "retry", "receiver_unavailable"
    if response.status_code != 200:
        return "attention_required", "receiver_rejected"
    try:
        ack = DeliveryAck.model_validate_json(response.content)
    except (ValidationError, ValueError):
        return "retry", "acknowledgement_invalid"
    if (ack.event_id, ack.pharmacy_id, ack.prescription_id, ack.sequence) != (
        event.event_id,
        event.pharmacy_id,
        event.prescription_id,
        event.sequence,
    ):
        return "retry", "acknowledgement_mismatch"
    return "delivered", None


async def finish(session_factory, claimed, state, error):
    event_id, lease_token, _, attempts = claimed
    now = datetime.now(UTC)
    async with session_factory() as db:
        row = await db.scalar(
            select(MedAppDelivery)
            .where(
                MedAppDelivery.id == event_id,
                MedAppDelivery.state == "sending",
                MedAppDelivery.lease_token == lease_token,
            )
            .with_for_update()
        )
        if row is None:
            return
        if state == "retry" and attempts % MAX_ATTEMPTS == 0:
            state, error = "attention_required", "retry_limit_reached"
        row.state, row.last_error = state, error
        row.delivered_at = now if state == "delivered" else None
        row.next_attempt_at = now + timedelta(seconds=min(900, 5 * 2 ** min(attempts - 1, 8)))
        row.lease_token = row.leased_until = None
        row.version += 1
        await db.commit()


async def deliver_one(session_factory, client):
    claimed = await claim(session_factory)
    if claimed is None:
        return False
    state, error = await transmit(client, claimed[2])
    await finish(session_factory, claimed, state, error)
    return True
