"""Durable delivery: python -m app.workers.prescriptions [--once --limit 100]."""

import argparse
import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
from shared.clinical_handoff import ClinicalHandoff, ClinicalHandoffAck
from sqlalchemy import select

from ..config import settings
from ..db import SessionLocal
from ..models import ClinicalPrescription, PrescriptionDelivery


async def claim(factory=SessionLocal):
    async with factory() as db:
        row = await db.scalar(
            select(PrescriptionDelivery)
            .where(
                PrescriptionDelivery.state.in_(["queued", "sending"]),
                PrescriptionDelivery.next_attempt_at <= datetime.now(UTC),
            )
            .order_by(
                PrescriptionDelivery.operation,
                PrescriptionDelivery.next_attempt_at,
                PrescriptionDelivery.id,
            )
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if row is None:
            return None
        rx = await db.get(ClinicalPrescription, row.prescription_id)
        if row.operation == "send" and rx.status != "issued":
            row.state, row.lease_token = "withdrawn", None
            await db.commit()
            return {"skipped": True}
        row.state, row.lease_token = "sending", uuid4()
        row.attempts += 1
        row.next_attempt_at = datetime.now(UTC) + timedelta(seconds=60)
        work = {
            "id": row.id,
            "token": row.lease_token,
            "payload": row.payload,
            "attempts": row.attempts,
        }
        await db.commit()
        return work


async def deliver(payload):
    command = ClinicalHandoff.model_validate(payload)
    secret = settings.clinical_handoff_secret.get_secret_value()
    if len(secret) < 32:
        return None, "configuration", True
    if command.operation == "send" and command.valid_until < datetime.now(UTC).date():
        return None, "expired", True
    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=False, trust_env=False) as client:
            response = await client.post(
                settings.pharmacy_service_url.rstrip("/") + "/internal/clinical-prescriptions",
                json=command.model_dump(mode="json"),
                headers={"X-Clinical-Handoff-Secret": secret},
            )
        if response.status_code != 200:
            permanent = 400 <= response.status_code < 500 and response.status_code not in {408, 429}
            return (
                None,
                "pharmacy_reconciliation" if permanent else "pharmacy_unavailable",
                permanent,
            )
        ack = ClinicalHandoffAck.model_validate(response.json())
        if not ack.matches(command):
            raise ValueError("mismatched acknowledgement")
        return ack.model_dump(mode="json"), None, False
    except (httpx.HTTPError, ValueError):
        return None, "unconfirmed_delivery", False


async def run_once(factory=SessionLocal):
    work = await claim(factory)
    if work is None:
        return False
    if work.get("skipped"):
        return True
    ack, error, permanent = await deliver(work["payload"])
    async with factory() as db:
        row = await db.scalar(
            select(PrescriptionDelivery)
            .where(
                PrescriptionDelivery.id == work["id"],
                PrescriptionDelivery.lease_token == work["token"],
                PrescriptionDelivery.state == "sending",
            )
            .with_for_update()
        )
        if row:
            row.lease_token, row.error_code = None, error
            if ack:
                row.state, row.acknowledgement = "delivered", ack
            else:
                row.state = "attention" if permanent or row.attempts % 12 == 0 else "queued"
                row.next_attempt_at = datetime.now(UTC) + timedelta(
                    seconds=min(900, 5 * 2 ** min(row.attempts, 8))
                )
            await db.commit()
    return True


async def main(once, limit):
    while True:
        for _ in range(limit):
            if not await run_once():
                break
        if once:
            return
        await asyncio.sleep(2)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--limit", type=int, choices=range(1, 1001), default=100)
    args = parser.parse_args()
    asyncio.run(main(args.once, args.limit))
