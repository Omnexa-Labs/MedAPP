"""Signed MedApp prescription ingestion and stock request authentication."""

from __future__ import annotations

import hashlib
import hmac
from uuid import UUID, uuid4, uuid5

from fastapi import HTTPException
from shared.pharmacy_sync import encode
from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models.core import Customer, Drug, Prescription, PrescriptionItem
from ..schemas.integrations import MedAppWebhookAck
from . import inventory_requests
from .medapp_delivery import enqueue

INGEST_NAMESPACE = UUID("b852ba09-bf5a-42a9-81bf-f8f6f96af454")


async def external_lock(db, reference):
    if db.bind.dialect.name == "postgresql":
        key = int.from_bytes(hashlib.sha256(f"clinical:{reference}".encode()).digest()[:8], "big", signed=True)
        await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})


def verify_signature(body: bytes, signature_header: str | None) -> bool:
    """HMAC-SHA256 of the raw body with the shared secret.

    Header format: `sha256=<hex>`. Constant-time comparison.
    """
    if not signature_header or len(settings.medapp_webhook_secret) < 32:
        return False
    secret = settings.medapp_webhook_secret.encode("utf-8")
    expected = hmac.new(secret, body, hashlib.sha256).hexdigest()
    provided = signature_header.removeprefix("sha256=").strip()
    return hmac.compare_digest(expected, provided)


def verify_partner_signature(
    method: str, path_with_query: str, body: bytes, signature_header: str | None
) -> bool:
    """HMAC-SHA256 over the canonical (METHOD\\npath?query\\nbody) triple.

    Used to authenticate MedApp pharmacy_service → pms_service calls
    (e.g. stock-availability) without relying on staff JWTs. The
    canonical form MUST stay byte-for-byte identical to the signing
    code in pharmacy_service.app.services.stock_service._sign_request
    — they're a contract.

    Header format: raw hex digest (no `sha256=` prefix), in
    `X-MedApp-Signature`. Constant-time comparison.
    """
    if not signature_header or len(settings.medapp_webhook_secret) < 32:
        return False
    secret = settings.medapp_webhook_secret.encode("utf-8")
    msg = f"{method.upper()}\n{path_with_query}\n".encode() + body
    expected = hmac.new(secret, msg, hashlib.sha256).hexdigest()
    provided = signature_header.strip()
    return hmac.compare_digest(expected, provided)


async def _resolve_drug(name: str, hint: UUID | None, db: AsyncSession, *, strength=None, form=None) -> Drug:
    filters = [Drug.is_active.is_(True)]
    if strength is not None:
        filters.append(func.lower(Drug.strength) == strength.lower())
    if form is not None:
        filters.append(func.lower(Drug.form) == form.lower())
    if hint is not None:
        matches = list(
            await db.scalars(select(Drug).where(Drug.id == hint, *filters))
        )
    else:
        matches = list(
            await db.scalars(
                select(Drug)
                .where(
                    *filters,
                    or_(
                        func.lower(Drug.name) == name.lower(),
                        func.lower(Drug.brand_name) == name.lower(),
                    ),
                )
                .limit(2)
            )
        )
    if len(matches) != 1:
        raise HTTPException(
            422,
            "Every item must resolve to exactly one active drug. Supply valid drug IDs for ambiguous names.",
        )
    return matches[0]


async def ingest_prescription(payload, db: AsyncSession, *, commit=True) -> dict:
    from ..models.clinical_handoff import ClinicalHandoffReceipt
    await external_lock(db, payload.external_ref)
    try:
        clinical_id = UUID(payload.external_ref)
    except ValueError:
        clinical_id = None
    receipt = await db.get(ClinicalHandoffReceipt, clinical_id) if clinical_id else None
    if receipt and receipt.cancel_ack:
        raise HTTPException(409, "this prescription has been withdrawn")
    normalized = payload.model_dump(mode="json")
    if payload.valid_until is None:
        normalized.pop("valid_until", None)  # Preserve pre-expiry ingestion receipts.
    for item in normalized["items"]:
        for field in ("strength", "form"):
            if item[field] is None:
                item.pop(field)
    request_id = uuid5(INGEST_NAMESPACE, payload.external_ref)
    previous = await inventory_requests.begin_request(
        db, request_id, INGEST_NAMESPACE, "medapp.ingest", normalized
    )
    if previous is not None:
        return previous
    digest = hashlib.sha256(encode(normalized)).hexdigest()
    existing = await db.scalar(
        select(Prescription).where(
            Prescription.source == "medapp", Prescription.external_ref == payload.external_ref
        )
    )
    if existing:
        # Legacy ingestion may have silently omitted drugs or used an editable
        # customer link. Never reinterpret or reassign that historical record.
        raise HTTPException(409, "This external reference needs explicit record reconciliation.")
    drugs = [await _resolve_drug(item.drug_name, item.drug_id_hint, db, strength=item.strength, form=item.form) for item in payload.items]
    customer = None
    if payload.customer_full_name or payload.customer_medapp_user_id:
        customer = Customer(
            full_name=payload.customer_full_name or "MedApp Customer",
            phone=payload.customer_phone,
            medapp_user_id=str(payload.customer_medapp_user_id)
            if payload.customer_medapp_user_id
            else None,
        )
        db.add(customer)
        await db.flush()
    rx = Prescription(
        rx_number="RX-" + uuid4().hex[:24],
        source="medapp",
        external_ref=payload.external_ref,
        medapp_patient_id=payload.customer_medapp_user_id,
        ingest_hash=digest,
        customer_id=customer.id if customer else None,
        prescriber_name=payload.prescriber_name,
        prescriber_license=payload.prescriber_license,
        status="pending",
        notes=payload.notes,
        valid_until=payload.valid_until,
    )
    db.add(rx)
    await db.flush()
    for item, drug in zip(payload.items, drugs, strict=True):
        db.add(
            PrescriptionItem(
                prescription_id=rx.id,
                drug_id=drug.id,
                drug_name_snapshot=drug.name,
                quantity_prescribed=item.quantity_prescribed,
                dosage_instructions=item.dosage_instructions,
            )
        )
    await db.flush()
    await enqueue(db, rx, "received")
    result = MedAppWebhookAck(
        prescription_id=rx.id,
        rx_number=rx.rx_number,
        accepted_item_count=len(drugs),
        unresolved_drugs=[],
    )
    await inventory_requests.finish_request(db, request_id, result, commit=commit)
    return result.model_dump(mode="json")
