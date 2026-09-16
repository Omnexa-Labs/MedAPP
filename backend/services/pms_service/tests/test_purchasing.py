from datetime import date, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select

from app.models.core import DrugBatch, PurchaseOrder, StockMovement

from . import test_inventory

setup = test_inventory.setup
drug = test_inventory.drug
post = test_inventory.post


async def order(client, quantity=20):
    item = await drug(client)
    supplier = (await client.post("/v1/suppliers", json={"name": "Care Supplier"})).json()
    payload = {
        "supplier_id": supplier["id"],
        "items": [{"drug_id": item["id"], "quantity": quantity, "unit_cost_cents": 100}],
    }
    response = await post(client, "/v1/purchase-orders", payload)
    assert response.status_code == 201, response.text
    return response.json(), payload


async def place(client, po):
    result = await post(client, f"/v1/purchase-orders/{po['id']}/send", {"version": po["version"]})
    assert result.status_code == 200, result.text
    return result.json()


def delivery(po, quantity=5, **values):
    return {
        "version": po["version"],
        "received_at": date.today().isoformat(),
        "delivery_reference": "DEL-01",
        "lines": [
            {
                "purchase_order_item_id": po["items"][0]["id"],
                "batch_number": "LOT-01",
                "quantity_received": quantity,
                "expiry_date": (date.today() + timedelta(days=90)).isoformat(),
            }
        ],
        **values,
    }


async def test_partial_deliveries_split_batches_replay_and_complete_without_changing_ordered_cost(
    setup,
):
    client, factory, _ = setup
    po, _ = await order(client)
    po = await place(client, po)
    path = f"/v1/purchase-orders/{po['id']}"
    body = delivery(po, 3)
    body["lines"].append(
        {
            **body["lines"][0],
            "batch_number": "LOT-02",
            "quantity_received": 2,
            "selling_price_cents": 0,
            "unit_cost_cents": 0,
        }
    )
    key = uuid4()
    first = await post(client, path + "/receive", body, key)
    assert first.status_code == 200, first.text
    saved = first.json()
    assert saved["status"] == "partially_received" and saved["version"] == 3
    assert (
        saved["items"][0]["quantity_received"] == 5
        and saved["items"][0]["quantity_outstanding"] == 15
    )
    assert (await post(client, path + "/receive", body, key)).json() == saved
    assert (await post(client, path + "/receive", body)).status_code == 409
    second = await post(client, path + "/receive", delivery(saved, 15))
    assert second.status_code == 200, second.text
    assert second.json()["status"] == "received" and second.json()["total_cents"] == 2000
    batches = (await client.get("/v1/batches", params={"purchase_order_id": po["id"]})).json()[
        "items"
    ]
    assert len(batches) == 3 and sum(b["quantity_on_hand"] for b in batches) == 20
    free = next(b for b in batches if b["batch_number"] == "LOT-02")
    assert free["selling_price_cents"] == free["unit_cost_cents"] == 0
    assert all(b["purchase_order_item_id"] == po["items"][0]["id"] for b in batches)
    async with factory() as db:
        assert await db.scalar(select(func.sum(StockMovement.delta))) == 20
    history = (await client.get(path + "/history")).json()["items"]
    assert [event["details"]["version"] for event in history] == [4, 3, 2, 1]
    assert all(event["actor_name"] == "QA Pharmacist" for event in history)


async def test_draft_edits_are_versioned_and_searchable_and_replay_does_not_duplicate(setup):
    client, _, _ = setup
    po, payload = await order(client)
    path = f"/v1/purchase-orders/{po['id']}"
    payload["notes"] = "Prepare next delivery"
    payload["items"][0]["quantity"] = 12
    key = str(uuid4())
    edited = await client.patch(
        path, json={**payload, "version": 1}, headers={"Idempotency-Key": key}
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["total_cents"] == 1200 and edited.json()["version"] == 2
    assert (
        await client.patch(path, json={**payload, "version": 1}, headers={"Idempotency-Key": key})
    ).json() == edited.json()
    assert (
        await client.patch(
            path, json={**payload, "version": 1}, headers={"Idempotency-Key": str(uuid4())}
        )
    ).status_code == 409
    await place(client, edited.json())
    assert (
        await client.patch(
            path, json={**payload, "version": 3}, headers={"Idempotency-Key": str(uuid4())}
        )
    ).status_code == 409
    page = (await client.get("/v1/purchase-orders?search=care&status=sent&limit=1")).json()
    assert page["total"] == 1 and page["items"][0]["supplier_name"] == "Care Supplier"
    assert (await client.get("/v1/purchase-orders?search=missing")).json()["total"] == 0


async def test_cancelling_remaining_quantities_preserves_stock_and_blocks_further_receipt(setup):
    client, _, _ = setup
    po, _ = await order(client)
    po = await place(client, po)
    path = f"/v1/purchase-orders/{po['id']}"
    partial = (await post(client, path + "/receive", delivery(po, 5))).json()
    closed = await post(
        client,
        path + "/cancel",
        {"version": partial["version"], "reason": "Supplier cannot fulfill the remainder"},
    )
    assert closed.status_code == 200, closed.text
    line = closed.json()["items"][0]
    assert (
        line["quantity_received"] == 5
        and line["quantity_cancelled"] == 15
        and line["quantity_outstanding"] == 0
    )
    assert (await post(client, path + "/receive", delivery(closed.json(), 1))).status_code == 409
    assert (await client.get("/v1/batches")).json()["items"][0]["quantity_on_hand"] == 5


@pytest.mark.parametrize(
    "bad",
    [
        "missing_supplier",
        "missing_drug",
        "wrong_currency",
        "duplicate",
        "negative",
        "overflow",
        "unknown",
    ],
)
async def test_invalid_orders_do_not_create_drafts(setup, bad):
    client, _, _ = setup
    _, payload = await order(client)
    if bad == "missing_supplier":
        payload["supplier_id"] = str(uuid4())
    if bad == "missing_drug":
        payload["items"][0]["drug_id"] = str(uuid4())
    if bad == "wrong_currency":
        payload["currency"] = "USD"
    if bad == "duplicate":
        payload["items"] *= 2
    if bad == "negative":
        payload["items"][0]["quantity"] = -1
    if bad == "overflow":
        payload["items"][0]["unit_cost_cents"] = 2_147_483_647
    if bad == "unknown":
        payload["pretend_sent"] = True
    assert (await post(client, "/v1/purchase-orders", payload)).status_code == 422
    assert (await client.get("/v1/purchase-orders")).json()["total"] == 1


@pytest.mark.parametrize(
    "bad", ["over", "split_over", "other_line", "expired", "future", "negative", "empty"]
)
async def test_invalid_deliveries_do_not_change_quantities_or_order_status(setup, bad):
    client, _, _ = setup
    po, _ = await order(client)
    po = await place(client, po)
    payload = delivery(po)
    if bad == "over":
        payload["lines"][0]["quantity_received"] = 21
    if bad == "split_over":
        payload["lines"] *= 5
    if bad == "other_line":
        payload["lines"][0]["purchase_order_item_id"] = str(uuid4())
    if bad == "expired":
        payload["lines"][0]["expiry_date"] = "2020-01-01"
    if bad == "future":
        payload["received_at"] = (date.today() + timedelta(days=1)).isoformat()
    if bad == "negative":
        payload["lines"][0]["unit_cost_cents"] = -1
    if bad == "empty":
        payload["lines"] = []
    response = await post(client, f"/v1/purchase-orders/{po['id']}/receive", payload)
    assert response.status_code in (409, 422), response.text
    assert (await client.get("/v1/batches")).json()["total"] == 0
    assert (await client.get(f"/v1/purchase-orders/{po['id']}")).json()["status"] == "sent"


async def test_cashiers_cannot_write_and_missing_orders_are_not_loading_forever(setup):
    client, _, actor = setup
    po, payload = await order(client)
    actor["role"] = "cashier"
    assert (await post(client, "/v1/purchase-orders", payload)).status_code == 403
    assert (
        await post(client, f"/v1/purchase-orders/{po['id']}/send", {"version": 1})
    ).status_code == 403
    assert (await client.get(f"/v1/purchase-orders/{po['id']}/history")).status_code == 403
    assert (await client.get(f"/v1/purchase-orders/{po['id']}")).status_code == 200
    assert (await client.get(f"/v1/purchase-orders/{uuid4()}")).status_code == 404


async def test_legacy_allocation_records_received_not_on_hand_without_changing_stock(setup):
    client, factory, actor = setup
    po, _ = await order(client)
    async with factory() as db, db.begin():
        stored = await db.get(PurchaseOrder, UUID(po["id"]))
        stored.status, stored.receiving_reconciled = "received", False
        batch = DrugBatch(
            drug_id=UUID(po["items"][0]["drug_id"]),
            purchase_order_id=stored.id,
            batch_number="OLD",
            quantity_received=12,
            quantity_on_hand=4,
            unit_cost_cents=100,
            selling_price_cents=300,
            currency="GHS",
            received_at=date.today(),
            expiry_date=date.today() + timedelta(days=20),
        )
        db.add(batch)
        await db.flush()
        batch_id = batch.id
    path = f"/v1/purchase-orders/{po['id']}"
    legacy = (await client.get(path)).json()
    assert legacy["items"][0]["quantity_received"] is None
    body = {
        "version": 1,
        "note": "Matched archived delivery paperwork",
        "allocations": [
            {"batch_id": str(batch_id), "purchase_order_item_id": po["items"][0]["id"]}
        ],
    }
    actor["role"] = "pharmacist"
    assert (await post(client, path + "/reconcile", body)).status_code == 403
    actor["role"] = "pharmacy_admin"
    reconciled = await post(client, path + "/reconcile", body)
    assert reconciled.status_code == 200, reconciled.text
    assert reconciled.json()["status"] == "partially_received"
    assert reconciled.json()["items"][0]["quantity_received"] == 12
    assert reconciled.json()["items"][0]["quantity_outstanding"] == 8
    async with factory() as db:
        stored = await db.get(DrugBatch, batch_id)
        assert stored.quantity_on_hand == 4 and stored.version == 2
        assert await db.scalar(select(func.count()).select_from(StockMovement)) == 0
