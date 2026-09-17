import copy
import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from app.config import settings
from app.models.core import DrugBatch, PharmacyProfile, Prescription
from app.models.workspace import MedAppWorkspace

from .test_inventory import post
from .test_inventory import setup as setup
from .test_medapp_delivery import SECRET, ingest
from .test_transactions import dispense_body, stocked

PATH = "/v1/integrations/medapp/clinical-prescriptions"


@pytest.fixture(autouse=True)
def config(monkeypatch):
    monkeypatch.setattr(settings, "medapp_webhook_secret", SECRET)
    monkeypatch.setattr(settings, "medapp_deployment_key", "accra")


async def prepared(setup):
    client, factory, _ = setup
    drug, batch = await stocked(client)
    async with factory() as db, db.begin():
        pharmacy = await db.scalar(select(PharmacyProfile))
        db.add(
            MedAppWorkspace(
                pharmacy_id=pharmacy.id,
                application_id=uuid4(),
                owner_id=uuid4(),
                deployment_key="accra",
            )
        )
        pharmacy_id = str(pharmacy.id)
    rx_id, patient = str(uuid4()), str(uuid4())
    return {
        "prescription_id": rx_id,
        "pharmacy_id": pharmacy_id,
        "patient_id": patient,
        "operation": "send",
        "valid_until": (datetime.now(UTC).date() + timedelta(days=10)).isoformat(),
        "prescription": {
            "external_ref": rx_id,
            "customer_medapp_user_id": patient,
            "prescriber_name": "Approved doctor",
            "items": [
                {
                    "drug_name": drug["name"],
                    "strength": drug["strength"],
                    "form": drug["form"],
                    "quantity_prescribed": 10,
                    "dosage_instructions": "Test directions",
                }
            ],
        },
    }, batch


async def send(client, body, signature=None):
    raw = json.dumps(body).encode()
    return await client.post(
        PATH,
        content=raw,
        headers={
            "X-MedApp-Signature": signature
            or hmac.new(
                SECRET.encode(), f"POST\n{PATH}\n".encode() + raw, hashlib.sha256
            ).hexdigest()
        },
    )


def cancellation(body):
    return {
        k: v
        for k, v in {**body, "operation": "cancel"}.items()
        if k not in {"prescription", "valid_until"}
    }


async def test_signed_handoff_replay_partial_dispense_and_withdrawal_preserve_stock(setup):
    client, factory, _ = setup
    body, batch = await prepared(setup)
    first = await send(client, body)
    assert first.status_code == 200, first.text
    assert (await send(client, body)).json() == first.json()
    rx_path = "/v1/prescriptions/" + first.json()["pms_prescription_id"]
    rx = (await client.get(rx_path)).json()
    assert rx["valid_until"] == body["valid_until"]
    assert (await post(client, rx_path + "/dispense", dispense_body(rx, 4))).status_code == 200
    cancel = await send(client, cancellation(body))
    assert cancel.status_code == 200, cancel.text
    assert (await send(client, cancellation(body))).json() == cancel.json()
    saved = (await client.get(rx_path)).json()
    assert saved["status"] == "cancelled" and saved["items"][0]["quantity_dispensed"] == 4
    assert (await post(client, rx_path + "/dispense", dispense_body(saved, 1))).status_code == 400
    async with factory() as db:
        assert (await db.get(DrugBatch, UUID(batch["id"]))).quantity_on_hand == batch[
            "quantity_on_hand"
        ] - 4


async def test_cancellation_before_delivery_is_durable_and_blocks_legacy_bypass(setup):
    client, factory, _ = setup
    body, _ = await prepared(setup)
    assert (await send(client, cancellation(body))).status_code == 200
    assert (await send(client, body)).status_code == 409
    assert (await ingest(client, body["prescription"])).status_code == 409
    async with factory() as db:
        assert (
            await db.scalar(
                select(Prescription).where(Prescription.external_ref == body["prescription_id"])
            )
            is None
        )


@pytest.mark.parametrize("bad", ["signature", "destination", "patient", "expired", "medicine"])
async def test_bad_handoffs_do_not_create_prescriptions(setup, bad):
    client, factory, _ = setup
    body, _ = await prepared(setup)
    if bad == "destination":
        body["pharmacy_id"] = str(uuid4())
    if bad == "patient":
        body["patient_id"] = str(uuid4())
    if bad == "expired":
        body["valid_until"] = "2020-01-01"
    if bad == "medicine":
        body["prescription"]["items"][0]["drug_name"] = "Unknown"
    response = await send(client, body, "invalid" if bad == "signature" else None)
    assert response.status_code in {401, 409, 422}, response.text
    async with factory() as db:
        assert (
            await db.scalar(
                select(Prescription).where(Prescription.external_ref == body["prescription_id"])
            )
            is None
        )


async def test_changed_contents_and_expired_dispensing_are_rejected(setup):
    client, factory, _ = setup
    body, _ = await prepared(setup)
    first = await send(client, body)
    assert first.status_code == 200, first.text
    changed = copy.deepcopy(body)
    changed["prescription"]["items"][0]["quantity_prescribed"] = 20
    assert (await send(client, changed)).status_code == 409
    async with factory() as db, db.begin():
        rx = await db.get(Prescription, UUID(first.json()["pms_prescription_id"]))
        rx.valid_until = datetime.now(UTC).date() - timedelta(days=1)
    rx_path = "/v1/prescriptions/" + first.json()["pms_prescription_id"]
    rx = (await client.get(rx_path)).json()
    assert (await post(client, rx_path + "/dispense", dispense_body(rx, 1))).status_code == 409
