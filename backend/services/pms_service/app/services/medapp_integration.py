"""MedApp integration: HMAC verification, inbound prescription ingest,
outbound dispense confirmation (best-effort, no-op when URL unset).
"""
from __future__ import annotations

import hashlib
import hmac
import logging
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models.core import Customer, Drug, Prescription, PrescriptionItem

logger = logging.getLogger(__name__)


def verify_signature(body: bytes, signature_header: str | None) -> bool:
    """HMAC-SHA256 of the raw body with the shared secret.

    Header format: `sha256=<hex>`. Constant-time comparison.
    """
    if not signature_header:
        return False
    secret = settings.medapp_webhook_secret.encode("utf-8")
    expected = hmac.new(secret, body, hashlib.sha256).hexdigest()
    provided = signature_header.removeprefix("sha256=").strip()
    return hmac.compare_digest(expected, provided)


async def _resolve_drug(name: str, hint: UUID | None, db: AsyncSession) -> Drug | None:
    if hint is not None:
        drug = (
            await db.execute(select(Drug).where(Drug.id == hint, Drug.is_active.is_(True)))
        ).scalar_one_or_none()
        if drug:
            return drug
    # Case-insensitive match against name or brand_name.
    stmt = select(Drug).where(
        Drug.is_active.is_(True),
        or_(
            func.lower(Drug.name) == name.lower(),
            func.lower(Drug.brand_name) == name.lower(),
        ),
    )
    return (await db.execute(stmt)).scalars().first()


async def _upsert_customer(
    db: AsyncSession,
    *,
    medapp_user_id: str | None,
    full_name: str | None,
    phone: str | None,
) -> Customer | None:
    if medapp_user_id:
        existing = (
            await db.execute(
                select(Customer).where(Customer.medapp_user_id == medapp_user_id)
            )
        ).scalar_one_or_none()
        if existing:
            return existing
    if not (medapp_user_id or full_name):
        return None
    c = Customer(
        full_name=full_name or "MedApp Customer",
        phone=phone,
        medapp_user_id=medapp_user_id,
    )
    db.add(c)
    await db.flush()
    return c


async def _next_rx_number(db: AsyncSession) -> str:
    n = (await db.execute(select(func.count(Prescription.id)))).scalar_one()
    return f"RX-{int(n) + 1:06d}"


async def ingest_prescription(payload, db: AsyncSession) -> dict:
    """Create a Prescription from a MedApp webhook payload.

    Idempotency: if a prescription with the same external_ref already exists,
    return it instead of creating a duplicate.
    """
    existing = (
        await db.execute(
            select(Prescription).where(
                Prescription.source == "medapp",
                Prescription.external_ref == payload.external_ref,
            )
        )
    ).scalar_one_or_none()
    if existing:
        item_count = (
            await db.execute(
                select(func.count(PrescriptionItem.id)).where(
                    PrescriptionItem.prescription_id == existing.id
                )
            )
        ).scalar_one()
        return {
            "prescription_id": existing.id,
            "rx_number": existing.rx_number,
            "accepted_item_count": int(item_count),
            "unresolved_drugs": [],
        }

    customer = await _upsert_customer(
        db,
        medapp_user_id=payload.customer_medapp_user_id,
        full_name=payload.customer_full_name,
        phone=payload.customer_phone,
    )

    rx = Prescription(
        rx_number=await _next_rx_number(db),
        source="medapp",
        external_ref=payload.external_ref,
        customer_id=customer.id if customer else None,
        prescriber_name=payload.prescriber_name,
        prescriber_license=payload.prescriber_license,
        status="pending",
        notes=payload.notes,
    )
    db.add(rx)
    await db.flush()

    unresolved: list[str] = []
    accepted = 0
    for item in payload.items:
        drug = await _resolve_drug(item.drug_name, item.drug_id_hint, db)
        if drug is None:
            unresolved.append(item.drug_name)
            continue
        db.add(PrescriptionItem(
            prescription_id=rx.id,
            drug_id=drug.id,
            drug_name_snapshot=drug.name,
            quantity_prescribed=item.quantity_prescribed,
            dosage_instructions=item.dosage_instructions,
        ))
        accepted += 1

    await db.flush()
    return {
        "prescription_id": rx.id,
        "rx_number": rx.rx_number,
        "accepted_item_count": accepted,
        "unresolved_drugs": unresolved,
    }


async def confirm_dispense(payload: dict[str, Any]) -> None:
    """Best-effort outbound POST to MedApp. No-op if URL not configured."""
    url = settings.medapp_dispense_webhook_url
    if not url:
        logger.debug("medapp_dispense_webhook_url unset; skipping outbound confirm")
        return
    secret = settings.medapp_webhook_secret.encode("utf-8")
    import json as _json

    raw = _json.dumps(payload, default=str).encode("utf-8")
    signature = "sha256=" + hmac.new(secret, raw, hashlib.sha256).hexdigest()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                url,
                content=raw,
                headers={
                    "content-type": "application/json",
                    "x-medapp-signature": signature,
                },
            )
    except Exception as exc:  # pragma: no cover — fire-and-forget
        logger.warning("medapp dispense confirm failed: %s", exc)
