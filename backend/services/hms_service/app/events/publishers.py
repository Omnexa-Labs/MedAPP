from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

logger = logging.getLogger(__name__)


def _build_cloud_event(
    event_type: str,
    data: dict[str, Any],
    tenant_id: str | UUID,
) -> dict[str, Any]:
    return {
        "specversion": "1.0",
        "id": str(uuid4()),
        "source": "hms_service",
        "type": event_type,
        "time": datetime.now(tz=timezone.utc).isoformat(),
        "datacontenttype": "application/json",
        "data": {**data, "tenant_id": str(tenant_id)},
    }


async def publish_patient_registered(
    tenant_id: str, patient_id: UUID, mrn: str, medapp_user_id: UUID | None = None
) -> None:
    event = _build_cloud_event(
        "hms.patient.registered",
        {"patient_id": str(patient_id), "mrn": mrn, "medapp_user_id": str(medapp_user_id) if medapp_user_id else None},
        tenant_id,
    )
    logger.info("event: %s", json.dumps(event))


async def publish_appointment_booked(
    tenant_id: str, appointment_id: UUID, patient_id: UUID, doctor_user_id: UUID, scheduled_date: str
) -> None:
    event = _build_cloud_event(
        "hms.appointment.booked",
        {"appointment_id": str(appointment_id), "patient_id": str(patient_id), "doctor_user_id": str(doctor_user_id), "scheduled_date": scheduled_date},
        tenant_id,
    )
    logger.info("event: %s", json.dumps(event))


async def publish_prescription_created(
    tenant_id: str, prescription_id: UUID, patient_id: UUID, items_count: int
) -> None:
    event = _build_cloud_event(
        "hms.prescription.created",
        {"prescription_id": str(prescription_id), "patient_id": str(patient_id), "items_count": items_count},
        tenant_id,
    )
    logger.info("event: %s", json.dumps(event))


async def publish_invoice_issued(
    tenant_id: str, invoice_id: UUID, patient_id: UUID, total_amount_cents: int, currency: str
) -> None:
    event = _build_cloud_event(
        "hms.invoice.issued",
        {"invoice_id": str(invoice_id), "patient_id": str(patient_id), "total_amount_cents": total_amount_cents, "currency": currency},
        tenant_id,
    )
    logger.info("event: %s", json.dumps(event))


async def publish_payment_received(
    tenant_id: str, invoice_id: UUID, amount_cents: int, method: str
) -> None:
    event = _build_cloud_event(
        "hms.payment.received",
        {"invoice_id": str(invoice_id), "amount_cents": amount_cents, "method": method},
        tenant_id,
    )
    logger.info("event: %s", json.dumps(event))


async def publish_stock_low(
    tenant_id: str, drug_id: UUID, drug_name: str, quantity_remaining: int, reorder_level: int
) -> None:
    event = _build_cloud_event(
        "hms.stock.low",
        {"drug_id": str(drug_id), "drug_name": drug_name, "quantity_remaining": quantity_remaining, "reorder_level": reorder_level},
        tenant_id,
    )
    logger.info("event: %s", json.dumps(event))
