import copy
import time
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from app.models import (
    PharmacyDeployment,
    PharmacyPrescription,
    PharmacyPrescriptionEvent,
    PharmacyProfile,
)
from shared.pharmacy_sync import SYNC_PATH, authenticated, encode, sign
from sqlalchemy import func, select

from tests.test_owner_workspaces import command as activation_command
from tests.test_owner_workspaces import configured, owner

SECRET = "pms-stock-separate-credential-2026"
PATIENT = uuid4()


@pytest.mark.parametrize(
    "timestamp,signature",
    [
        ("²", "sha256=abc"),
        ("1" * 100, "sha256=abc"),
        (str(int(time.time())), "sha256=é"),
        (None, None),
    ],
)
def test_invalid_signature_headers_fail_closed(timestamp, signature):
    assert not authenticated(b"{}", SECRET, timestamp, signature)


@pytest.fixture
def command(monkeypatch):
    return activation_command.__wrapped__(monkeypatch)


def event(pharmacy_id, sequence=1):
    return {
        "schema_version": 1,
        "event_id": str(uuid4()),
        "deployment_key": "accra",
        "pharmacy_id": pharmacy_id,
        "prescription_id": str(uuid4()),
        "external_ref": str(uuid4()),
        "patient_id": str(PATIENT),
        "sequence": sequence,
        "kind": "received",
        "disposition": None,
        "occurred_at": datetime.now(UTC).isoformat(),
        "snapshot": {
            "rx_number": "RX-QA",
            "rx_version": 1,
            "status": "pending",
            "prescriber_name": "Dr QA",
            "items": [
                {
                    "prescription_item_id": str(uuid4()),
                    "drug_name": "QA medicine",
                    "dosage_instructions": "As directed",
                    "quantity_prescribed": 10,
                    "quantity_dispensed": 0,
                    "quantity_returned": 0,
                }
            ],
        },
    }


async def send(client, payload, timestamp=None, secret=SECRET):
    raw, timestamp = encode(payload), timestamp or str(int(time.time()))
    return await client.post(
        SYNC_PATH,
        content=raw,
        headers={
            "X-MedApp-Deployment": "accra",
            "X-MedApp-Timestamp": timestamp,
            "X-MedApp-Signature": sign(raw, secret, timestamp),
        },
    )


async def test_delivery_replays_original_ack_and_out_of_order_reports_do_not_rewind_patient_history(
    client, command, session_factory
):
    pharmacy_id = await configured(client, command, session_factory)
    first = event(pharmacy_id)
    latest = copy.deepcopy(first)
    latest.update(
        event_id=str(uuid4()), sequence=3, kind="corrected", disposition="customer_return"
    )
    latest["snapshot"].update(status="dispensed", rx_version=2)
    latest["snapshot"]["items"][0].update(quantity_dispensed=10, quantity_returned=2)
    response = await send(client, latest)
    assert response.status_code == 200 and response.json()["applied"]
    old = await send(client, first)
    assert old.status_code == 200 and not old.json()["applied"]
    assert (await send(client, latest)).json() == response.json()
    assert (await send(client, first)).json() == old.json()
    owner(PATIENT)
    page = await client.get("/v1/me/pharmacy-prescriptions")
    assert page.status_code == 200 and page.headers["cache-control"] == "private, no-store"
    record = page.json()["items"][0]
    assert record["sequence"] == 3 and record["snapshot"]["items"][0]["quantity_returned"] == 2
    assert not {"patient_id", "external_ref", "payload"} & record.keys()
    detail = "/v1/me/pharmacy-prescriptions/" + record["id"]
    assert (await client.get(detail)).json() == record
    owner(uuid4())
    assert (await client.get("/v1/me/pharmacy-prescriptions")).json()["items"] == []
    assert (await client.get(detail)).status_code == 404
    async with session_factory() as db:
        assert await db.scalar(select(func.count(PharmacyPrescription.id))) == 1
        assert await db.scalar(select(func.count(PharmacyPrescriptionEvent.id))) == 2


@pytest.mark.parametrize(
    "change",
    ["patient_id", "external_ref", "prescription_id", "item", "quantity", "sequence", "event"],
)
async def test_identity_reassignment_or_reusing_sequence_or_event_is_rejected(
    client, command, session_factory, change
):
    pharmacy_id = await configured(client, command, session_factory)
    original = event(pharmacy_id)
    assert (await send(client, original)).status_code == 200
    changed = copy.deepcopy(original)
    changed.update(sequence=2, event_id=str(uuid4()))
    if change in {"patient_id", "external_ref", "prescription_id"}:
        changed[change] = str(uuid4())
    elif change == "item":
        changed["snapshot"]["items"][0]["prescription_item_id"] = str(uuid4())
    elif change == "quantity":
        changed["snapshot"]["items"][0]["quantity_prescribed"] = 20
    elif change == "sequence":
        changed["sequence"] = 1
    else:
        changed["event_id"] = original["event_id"]
    assert (await send(client, changed)).status_code == 409


@pytest.mark.parametrize(
    "bad", ["stale", "future", "signature", "deployment", "pharmacy", "inactive", "unconfirmed"]
)
async def test_only_fresh_authenticated_bound_pharmacy_can_deliver(
    client, command, session_factory, bad
):
    pharmacy_id = await configured(client, command, session_factory)
    payload = event(pharmacy_id)
    kwargs = {}
    if bad in {"stale", "future"}:
        kwargs["timestamp"] = str(int(time.time()) + (-600 if bad == "stale" else 600))
    elif bad == "signature":
        kwargs["secret"] = "wrong"
    elif bad == "deployment":
        payload["deployment_key"] = "other"
    elif bad == "pharmacy":
        payload["pharmacy_id"] = str(uuid4())
    else:
        async with session_factory() as db, db.begin():
            if bad == "inactive":
                (await db.get(PharmacyProfile, UUID(pharmacy_id))).is_active = False
            else:
                (await db.scalar(select(PharmacyDeployment))).activated_at = None
    assert (await send(client, payload, **kwargs)).status_code in {401, 403}
    async with session_factory() as db:
        assert await db.scalar(select(func.count(PharmacyPrescriptionEvent.id))) == 0


async def test_invalid_balance_or_large_payload_never_enters_history(
    client, command, session_factory
):
    pharmacy_id = await configured(client, command, session_factory)
    payload = event(pharmacy_id)
    payload["snapshot"]["items"][0]["quantity_dispensed"] = 12
    assert (await send(client, payload)).status_code == 422
    payload["snapshot"]["items"][0]["drug_name"] = "x" * 256_001
    assert (await send(client, payload)).status_code == 413
