from datetime import date, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.models.core import AuditLog, DrugBatch, InventoryRequest, Prescription, Sale
from app.services import inventory_requests, medapp_integration

from . import test_inventory

setup = test_inventory.setup
batch, drug, post = test_inventory.batch, test_inventory.drug, test_inventory.post


async def stocked(client):
    item = await drug(client)
    row = await batch(client, item["id"])
    return item, row


async def make_rx(client, item):
    response = await post(
        client, "/v1/prescriptions", {"items": [{"drug_id": item["id"], "quantity_prescribed": 10}]}
    )
    assert response.status_code == 201, response.text
    return response.json()


def dispense_body(rx, quantity=2):
    return {
        "version": rx["version"],
        "items": [{"prescription_item_id": rx["items"][0]["id"], "quantity": quantity}],
        "notes": "Verified original prescription",
    }


async def test_sale_quote_uses_split_batch_prices_and_has_no_side_effects(setup):
    client, factory, _ = setup
    item = await drug(client, default_selling_price_cents=999)
    first = await batch(
        client,
        item["id"],
        quantity_received=2,
        selling_price_cents=0,
        expiry_date=(date.today() + timedelta(days=2)).isoformat(),
    )
    await batch(client, item["id"], batch_number="LOT-02", selling_price_cents=350)
    body = {
        "items": [{"drug_id": item["id"], "quantity": 4}],
        "tax_cents": 50,
        "discount_cents": 100,
    }
    quote = await client.post("/v1/sales/quote", json=body)
    assert quote.status_code == 200, quote.text
    assert quote.json()["total_cents"] == 650
    assert quote.json()["items"][0]["batch_id"] == first["id"]
    assert [line["unit_price_cents"] for line in quote.json()["items"]] == [0, 350]
    async with factory() as db:
        assert await db.scalar(select(func.count(Sale.id))) == 0
        assert await db.scalar(select(func.sum(DrugBatch.quantity_on_hand))) == 22
    saved = await post(client, "/v1/sales", {**body, "expected_total_cents": 650})
    assert saved.status_code == 201 and saved.json()["total_cents"] == 650


async def test_sale_replay_returns_original_receipt_after_void_and_checks_actor_payload(setup):
    client, factory, actor = setup
    item, row = await stocked(client)
    key = uuid4()
    body = {
        "items": [{"drug_id": item["id"], "quantity": 3}],
        "notes": "Customer collected",
        "payment_ref": "CASH-17",
    }
    original = await post(client, "/v1/sales", body, key)
    assert original.status_code == 201, original.text
    sale = original.json()
    void_key = uuid4()
    void_body = {"version": 1, "reason": "Goods retained at counter"}
    voided = await post(client, f"/v1/sales/{sale['id']}/void", void_body, void_key)
    assert voided.status_code == 200
    assert (
        await post(client, f"/v1/sales/{sale['id']}/void", void_body, void_key)
    ).json() == voided.json()
    assert (await post(client, "/v1/sales", body, key)).json() == sale
    assert sale["notes"] == body["notes"]
    assert (await client.get(f"/v1/sales/{sale['id']}")).json()["version"] == 2
    assert (
        await post(client, "/v1/sales", {**body, "payment_ref": "different"}, key)
    ).status_code == 409
    actor["id"] = uuid4()
    assert (await post(client, "/v1/sales", body, key)).status_code == 409
    async with factory() as db:
        assert await db.scalar(select(func.count(Sale.id))) == 1
        assert (await db.get(DrugBatch, UUID(row["id"]))).quantity_on_hand == 20
        assert (
            await db.scalar(select(func.count(AuditLog.id)).where(AuditLog.entity_type == "sale"))
            == 2
        )


async def test_changed_quote_and_bad_customer_roll_back_receipt_and_stock(setup):
    client, factory, _ = setup
    item, row = await stocked(client)
    body = {"items": [{"drug_id": item["id"], "quantity": 2}]}
    key = uuid4()
    assert (
        await post(client, "/v1/sales", {**body, "expected_total_cents": 400}, key)
    ).status_code == 409
    assert (
        await post(client, "/v1/sales", {**body, "customer_id": str(uuid4())})
    ).status_code == 400
    async with factory() as db:
        assert await db.get(InventoryRequest, key) is None
        assert await db.scalar(select(func.count(Sale.id))) == 0
        assert (await db.get(DrugBatch, UUID(row["id"]))).version == 1


async def test_prescription_creation_replays_and_protects_source(setup):
    client, factory, _ = setup
    item, _ = await stocked(client)
    body = {
        "prescriber_name": "Dr QA",
        "prescriber_license": "QA-12",
        "items": [
            {
                "drug_id": item["id"],
                "quantity_prescribed": 10,
                "dosage_instructions": "As prescribed",
            }
        ],
    }
    key = uuid4()
    original = await post(client, "/v1/prescriptions", body, key)
    assert original.status_code == 201
    assert (await post(client, "/v1/prescriptions", body, key)).json() == original.json()
    assert (
        await post(client, "/v1/prescriptions", {**body, "source": "medapp"})
    ).status_code == 422
    async with factory() as db:
        assert await db.scalar(select(func.count(Prescription.id))) == 1


async def test_partial_dispense_retry_then_cancel_preserves_dispensed_units(setup):
    client, factory, actor = setup
    item, row = await stocked(client)
    rx = await make_rx(client, item)
    path = f"/v1/prescriptions/{rx['id']}"
    body = dispense_body(rx)
    quote = await client.post(path + "/quote", json=body)
    assert quote.status_code == 200 and quote.json()["total_cents"] == 500
    key = uuid4()
    first = await post(client, path + "/dispense", {**body, "expected_total_cents": 500}, key)
    assert first.status_code == 200, first.text
    assert first.json()["rx_version"] == 2
    assert (
        await post(client, path + "/dispense", {**body, "expected_total_cents": 500}, key)
    ).json() == first.json()
    assert (await post(client, path + "/dispense", body)).status_code == 409
    assert (
        await post(client, path + "/cancel", {"version": 1, "reason": "Patient declined"})
    ).status_code == 409
    cancel_key = uuid4()
    cancelled = await post(
        client,
        path + "/cancel",
        {"version": 2, "reason": "Patient declined remaining units"},
        cancel_key,
    )
    assert cancelled.status_code == 200 and cancelled.json()["version"] == 3
    assert cancelled.json()["items"][0]["quantity_dispensed"] == 2
    assert (
        await post(
            client,
            path + "/cancel",
            {"version": 2, "reason": "Patient declined remaining units"},
            cancel_key,
        )
    ).json() == cancelled.json()
    assert (await post(client, path + "/dispense", {**body, "version": 3})).status_code == 400
    sale = (await client.get(f"/v1/sales/{first.json()['sale_id']}")).json()
    assert sale["notes"] == body["notes"]
    actor["role"] = "cashier"
    assert (await post(client, path + "/dispense", body, key)).status_code == 403
    assert (await client.post(path + "/quote", json=body)).status_code == 403
    async with factory() as db:
        assert (await db.get(DrugBatch, UUID(row["id"]))).quantity_on_hand == 18
        assert await db.scalar(select(func.count(Sale.id))) == 1


async def test_receipt_failure_rolls_back_entire_dispense_and_can_retry(setup, monkeypatch):
    client, factory, _ = setup
    item, row = await stocked(client)
    rx = await make_rx(client, item)
    key, original_finish = uuid4(), inventory_requests.finish_request

    async def fail(*args):
        raise HTTPException(503, "Simulated receipt failure")

    monkeypatch.setattr(inventory_requests, "finish_request", fail)
    assert (
        await post(client, f"/v1/prescriptions/{rx['id']}/dispense", dispense_body(rx), key)
    ).status_code == 503
    async with factory() as db:
        assert await db.get(InventoryRequest, key) is None
        assert await db.scalar(select(func.count(Sale.id))) == 0
        assert (await db.get(DrugBatch, UUID(row["id"]))).quantity_on_hand == 20
        assert (await db.get(Prescription, UUID(rx["id"]))).version == 1
    monkeypatch.setattr(inventory_requests, "finish_request", original_finish)
    assert (
        await post(client, f"/v1/prescriptions/{rx['id']}/dispense", dispense_body(rx), key)
    ).status_code == 200


async def test_outbound_runs_after_commit_and_is_not_repeated_by_replay(setup, monkeypatch):
    client, factory, _ = setup
    item, _ = await stocked(client)
    rx = await make_rx(client, item)
    async with factory() as db, db.begin():
        stored = await db.get(Prescription, UUID(rx["id"]))
        stored.source, stored.external_ref = "medapp", "external-qa"
    key = uuid4()
    called = []

    async def outbound(payload):
        async with factory() as db:
            assert (await db.get(InventoryRequest, key)).result["sale_number"] == payload[
                "sale_number"
            ]
        called.append(payload)

    monkeypatch.setattr(medapp_integration, "confirm_dispense", outbound)
    for _ in range(2):
        assert (
            await post(client, f"/v1/prescriptions/{rx['id']}/dispense", dispense_body(rx), key)
        ).status_code == 200
    assert len(called) == 1
    assert set(called[0]) == {
        "external_ref",
        "rx_number",
        "status",
        "sale_number",
        "sale_total_cents",
        "currency",
        "lines",
    }


@pytest.mark.parametrize(
    "change",
    [
        {"payment_method": "crypto"},
        {"payment_ref": "x" * 129},
        {"notes": "x" * 2001},
        {"expected_total_cents": True},
        {"unexpected": "ignored before"},
    ],
)
async def test_strict_payment_inputs_do_not_create_sales(setup, change):
    client, _, _ = setup
    item, _ = await stocked(client)
    body = {"items": [{"drug_id": item["id"], "quantity": 1}], **change}
    assert (await post(client, "/v1/sales", body)).status_code == 422
    assert (await client.get("/v1/sales")).json()["total"] == 0


async def test_duplicate_lines_are_rejected_and_lists_are_paged(setup):
    client, _, _ = setup
    item, _ = await stocked(client)
    line = {"drug_id": item["id"], "quantity": 1}
    assert (await post(client, "/v1/sales", {"items": [line, line]})).status_code == 422
    rx = await make_rx(client, item)
    body = dispense_body(rx)
    assert (
        await post(
            client, f"/v1/prescriptions/{rx['id']}/dispense", {**body, "items": body["items"] * 2}
        )
    ).status_code == 422
    sales = [(await post(client, "/v1/sales", {"items": [line]})).json() for _ in range(3)]
    page = (await client.get("/v1/sales", params={"limit": 1, "offset": 1})).json()
    assert page["total"] == 3 and len(page["items"]) == 1
    assert (await client.get("/v1/sales", params={"search": sales[0]["sale_number"]})).json()[
        "total"
    ] == 1
    assert (await client.get("/v1/prescriptions", params={"status": "pending", "limit": 1})).json()[
        "total"
    ] == 1
    assert (await client.get("/v1/sales", params={"status": "made-up"})).status_code == 422


async def test_multiple_prescription_lines_for_same_drug_share_available_stock(setup):
    client, factory, _ = setup
    item, row = await stocked(client)
    response = await post(
        client,
        "/v1/prescriptions",
        {
            "items": [
                {
                    "drug_id": item["id"],
                    "quantity_prescribed": 12,
                    "dosage_instructions": "First course",
                },
                {
                    "drug_id": item["id"],
                    "quantity_prescribed": 12,
                    "dosage_instructions": "Second course",
                },
            ]
        },
    )
    rx = response.json()
    body = {
        "version": 1,
        "items": [{"prescription_item_id": line["id"], "quantity": 12} for line in rx["items"]],
    }
    assert (await post(client, f"/v1/prescriptions/{rx['id']}/dispense", body)).status_code == 400
    body["items"][1]["quantity"] = 8
    saved = await post(client, f"/v1/prescriptions/{rx['id']}/dispense", body)
    assert saved.status_code == 200 and saved.json()["sale_total_cents"] == 5000
    async with factory() as db:
        assert (await db.get(DrugBatch, UUID(row["id"]))).quantity_on_hand == 0
        assert await db.scalar(select(func.count(Sale.id))) == 1
