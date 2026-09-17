import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi import HTTPException
from shared.pharmacy_sync import DispensingEvent, authenticated
from sqlalchemy import func, select

from app.config import settings
from app.models.core import Customer, PharmacyProfile, Prescription, Sale
from app.models.delivery import MedAppDelivery
from app.models.workspace import MedAppWorkspace
from app.services import inventory_requests
from app.services import medapp_delivery as delivery

from . import test_inventory, test_sale_corrections, test_transactions

setup = test_inventory.setup
post = test_inventory.post
SECRET = "medapp-test-pharmacy-sync-secret-2026"


@pytest.fixture(autouse=True)
def config(monkeypatch):
    monkeypatch.setattr(settings, "medapp_webhook_secret", SECRET)
    monkeypatch.setattr(settings, "medapp_deployment_key", "accra")
    monkeypatch.setattr(settings, "medapp_sync_url", "https://medapp.test/v1/pharmacy-sync/events")


async def ingest(client, payload):
    raw = json.dumps(payload).encode()
    return await client.post(
        "/v1/integrations/medapp/prescriptions",
        content=raw,
        headers={
            "X-MedApp-Signature": "sha256="
            + hmac.new(SECRET.encode(), raw, hashlib.sha256).hexdigest(),
        },
    )


async def prepared(setup):
    client, factory, _ = setup
    drug, batch = await test_transactions.stocked(client)
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
    payload = {
        "external_ref": str(uuid4()),
        "customer_medapp_user_id": str(uuid4()),
        "customer_full_name": "Test patient",
        "items": [
            {"drug_name": drug["name"], "drug_id_hint": drug["id"], "quantity_prescribed": 10}
        ],
    }
    response = await ingest(client, payload)
    assert response.status_code == 201, response.text
    rx = (await client.get("/v1/prescriptions/" + response.json()["prescription_id"])).json()
    return rx, payload, batch


async def test_ingest_replays_atomically_rejects_changed_identity_and_freezes_recipient(setup):
    client, factory, _ = setup
    rx, payload, _ = await prepared(setup)
    assert (await ingest(client, payload)).json()["prescription_id"] == rx["id"]
    assert (
        await ingest(client, {**payload, "customer_medapp_user_id": str(uuid4())})
    ).status_code == 409
    async with factory() as db, db.begin():
        (await db.get(Customer, UUID(rx["customer_id"]))).medapp_user_id = str(uuid4())
    response = await post(
        client, f"/v1/prescriptions/{rx['id']}/dispense", test_transactions.dispense_body(rx, 4)
    )
    assert response.status_code == 200, response.text
    async with factory() as db:
        rows = list(await db.scalars(select(MedAppDelivery).order_by(MedAppDelivery.sequence)))
        assert [row.sequence for row in rows] == [1, 2]
        assert [row.payload["kind"] for row in rows] == ["received", "dispensed"]
        assert all(row.payload["patient_id"] == payload["customer_medapp_user_id"] for row in rows)
        assert all(row.state == "pending" for row in rows)
        for row in rows:
            DispensingEvent.model_validate(row.payload)


@pytest.mark.parametrize("bad", ["missing", "ambiguous", "hint", "zero", "bool", "empty"])
async def test_ingest_never_accepts_a_partial_or_invalid_prescription(setup, bad):
    client, factory, _ = setup
    drug, _ = await test_transactions.stocked(client)
    item = {"drug_name": drug["name"], "quantity_prescribed": 10}
    if bad == "ambiguous":
        await test_inventory.drug(client)
    elif bad == "missing":
        item["drug_name"] = "Unknown drug"
    elif bad == "hint":
        item["drug_id_hint"] = str(uuid4())
    elif bad in {"zero", "bool"}:
        item["quantity_prescribed"] = 0 if bad == "zero" else True
    items = [item] if bad != "empty" else []
    response = await ingest(client, {"external_ref": str(uuid4()), "items": items})
    assert response.status_code in {400, 422}
    async with factory() as db:
        assert await db.scalar(select(func.count(Prescription.id))) == 0
        assert await db.scalar(select(func.count(MedAppDelivery.id))) == 0


async def test_corrections_and_cancellation_queue_complete_snapshots_without_reopening_returns(
    setup,
):
    client, factory, _ = setup
    rx, _, _ = await prepared(setup)
    dispensed = (
        await post(
            client, f"/v1/prescriptions/{rx['id']}/dispense", test_transactions.dispense_body(rx, 4)
        )
    ).json()
    for kind in ["customer_return", "not_collected"]:
        sale = (await client.get("/v1/sales/" + dispensed["sale_id"])).json()
        current = (await client.get("/v1/prescriptions/" + rx["id"])).json()
        key = uuid4()
        body = test_sale_corrections.correction(sale, current, kind=kind)
        for _ in range(2):
            result = await post(client, f"/v1/sales/{sale['id']}/corrections", body, key)
            assert result.status_code == 201, result.text
    current = (await client.get("/v1/prescriptions/" + rx["id"])).json()
    assert (
        await post(
            client,
            f"/v1/prescriptions/{rx['id']}/cancel",
            {"version": current["version"], "reason": "Prescriber confirmed"},
        )
    ).status_code == 200
    async with factory() as db:
        rows = list(await db.scalars(select(MedAppDelivery).order_by(MedAppDelivery.sequence)))
        assert [row.sequence for row in rows] == [1, 2, 3, 4, 5]
        snapshots = [row.payload["snapshot"] for row in rows]
        assert [s["items"][0]["quantity_dispensed"] for s in snapshots] == [0, 4, 4, 3, 3]
        assert [s["items"][0]["quantity_returned"] for s in snapshots] == [0, 0, 1, 1, 1]
        assert snapshots[-1]["status"] == "cancelled"


async def test_failed_local_commit_rolls_back_delivery_as_well_as_stock(setup, monkeypatch):
    client, factory, _ = setup
    rx, _, _ = await prepared(setup)

    async def failure(*args):
        raise HTTPException(503, "Database interrupted")

    monkeypatch.setattr(inventory_requests, "finish_request", failure)
    result = await post(
        client, f"/v1/prescriptions/{rx['id']}/dispense", test_transactions.dispense_body(rx)
    )
    assert result.status_code == 503
    async with factory() as db:
        assert await db.scalar(select(func.count(MedAppDelivery.id))) == 1
        assert await db.scalar(select(func.count(Sale.id))) == 0
        assert (await db.get(Prescription, UUID(rx["id"]))).sync_sequence == 1


def acknowledgement(payload):
    return {
        key: payload[key] for key in ["event_id", "pharmacy_id", "prescription_id", "sequence"]
    } | {"applied": True}


@pytest.mark.parametrize(
    "failure,error,state",
    [
        (503, "receiver_unavailable", "retry"),
        (429, "receiver_unavailable", "retry"),
        (401, "receiver_rejected", "attention_required"),
        (302, "receiver_rejected", "attention_required"),
        ("network", "transport_unavailable", "retry"),
        ("html", "acknowledgement_invalid", "retry"),
        ("wrong", "acknowledgement_mismatch", "retry"),
    ],
)
async def test_failures_remain_visible_and_only_a_matching_ack_delivers(
    setup, failure, error, state
):
    await prepared(setup)
    _, factory, _ = setup

    def response(request):
        assert authenticated(
            request.content,
            SECRET,
            request.headers["X-MedApp-Timestamp"],
            request.headers["X-MedApp-Signature"],
        )
        if failure == "network":
            raise httpx.ConnectError("unreachable", request=request)
        if failure == "html":
            return httpx.Response(200, text="<html>Sign in</html>")
        if failure == "wrong":
            payload = acknowledgement(json.loads(request.content))
            payload["event_id"] = str(uuid4())
            return httpx.Response(200, json=payload)
        return httpx.Response(failure)

    async with httpx.AsyncClient(transport=httpx.MockTransport(response)) as client:
        assert await delivery.deliver_one(factory, client)
        assert not await delivery.deliver_one(factory, client)
    async with factory() as db, db.begin():
        row = await db.scalar(select(MedAppDelivery))
        assert row.state == state and row.last_error == error and row.attempts == 1
        assert row.delivered_at is None
        row.state, row.next_attempt_at = "retry", datetime.now(UTC) - timedelta(seconds=1)
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json=acknowledgement(json.loads(request.content)))
        )
    ) as client:
        assert await delivery.deliver_one(factory, client)
    async with factory() as db:
        row = await db.scalar(select(MedAppDelivery))
        assert row.state == "delivered" and row.attempts == 2 and row.delivered_at


async def test_expired_lease_recovers_and_old_worker_cannot_overwrite_new_ack(setup):
    await prepared(setup)
    _, factory, _ = setup
    first = await delivery.claim(factory)
    assert await delivery.claim(factory) is None
    async with factory() as db, db.begin():
        (await db.get(MedAppDelivery, first[0])).leased_until = datetime.now(UTC) - timedelta(
            seconds=1
        )
    second = await delivery.claim(factory)
    assert second[0] == first[0] and second[1] != first[1]
    await delivery.finish(factory, second, "delivered", None)
    await delivery.finish(factory, first, "retry", "receiver_unavailable")
    async with factory() as db:
        assert (await db.get(MedAppDelivery, first[0])).state == "delivered"


async def test_staff_retry_is_versioned_replayable_and_excludes_payload(setup):
    rx, _, _ = await prepared(setup)
    client, factory, actor = setup
    path = f"/v1/prescriptions/{rx['id']}/medapp-deliveries"
    async with factory() as db, db.begin():
        row = await db.scalar(select(MedAppDelivery))
        row.state, row.last_error = "attention_required", "retry_limit_reached"
    result = (await client.get(path)).json()["items"][0]
    assert "payload" not in result and result["can_retry"]
    actor["role"] = "cashier"
    assert (
        await post(client, path + f"/{result['id']}/retry", {"version": result["version"]})
    ).status_code == 403
    actor["role"] = "pharmacist"
    key = uuid4()
    response = await post(
        client, path + f"/{result['id']}/retry", {"version": result["version"]}, key
    )
    assert response.status_code == 200 and response.json()["state"] == "pending"
    assert (
        await post(client, path + f"/{result['id']}/retry", {"version": result["version"]}, key)
    ).json() == response.json()
    assert (
        await post(client, path + f"/{result['id']}/retry", {"version": result["version"]})
    ).status_code == 409


async def test_automatic_retries_pause_at_limit_and_manual_retry_resumes_without_resetting_attempts(
    setup,
):
    rx, _, _ = await prepared(setup)
    client, factory, _ = setup
    async with factory() as db, db.begin():
        row = await db.scalar(select(MedAppDelivery))
        row.attempts = 11
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(503))
    ) as receiver:
        assert await delivery.deliver_one(factory, receiver)
        assert not await delivery.deliver_one(factory, receiver)
        path = f"/v1/prescriptions/{rx['id']}/medapp-deliveries"
        saved = (await client.get(path)).json()["items"][0]
        assert saved["attempts"] == 12 and saved["last_error"] == "retry_limit_reached"
        assert (
            await post(client, path + f"/{saved['id']}/retry", {"version": saved["version"]})
        ).status_code == 200
        assert await delivery.deliver_one(factory, receiver)
        latest = (await client.get(path)).json()["items"][0]
        assert latest["attempts"] == 13 and latest["state"] == "retry"


async def test_oversized_license_is_rejected_before_reaching_postgres(setup):
    client, factory, _ = setup
    drug, _ = await test_transactions.stocked(client)
    result = await ingest(
        client,
        {
            "external_ref": str(uuid4()),
            "prescriber_license": "x" * 65,
            "items": [{"drug_name": drug["name"], "quantity_prescribed": 1}],
        },
    )
    assert result.status_code == 400
    async with factory() as db:
        assert await db.scalar(select(func.count(Prescription.id))) == 0
