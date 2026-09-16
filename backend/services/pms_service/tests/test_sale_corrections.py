from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.models.core import (
    DrugBatch,
    InventoryRequest,
    Prescription,
    Sale,
    SaleCorrection,
    SaleItem,
    SaleRefund,
    StockMovement,
)
from app.services import inventory_requests

from . import test_inventory, test_transactions

setup = test_inventory.setup
post, drug, batch = test_inventory.post, test_inventory.drug, test_inventory.batch


async def dispensed_sale(client):
    item, row = await test_transactions.stocked(client)
    rx = await test_transactions.make_rx(client, item)
    response = await post(
        client, f"/v1/prescriptions/{rx['id']}/dispense", test_transactions.dispense_body(rx, 4)
    )
    assert response.status_code == 200, response.text
    sale = (await client.get("/v1/sales/" + response.json()["sale_id"])).json()
    rx = (await client.get("/v1/prescriptions/" + rx["id"])).json()
    return sale, rx, row


def correction(sale, rx=None, quantity=1, kind="not_collected"):
    return {
        "version": sale["version"],
        "prescription_version": rx["version"] if rx else None,
        "reason": "Verified at the pharmacy counter",
        "stock_confirmed": True,
        "kind": kind,
        "items": [{"sale_item_id": sale["items"][0]["id"], "quantity": quantity}],
    }


def refund(version, amount=250, reference="PAY-REFUND-001"):
    return {
        "version": version,
        "reason": "Credited units refunded",
        "amount_cents": amount,
        "payment_method": "cash",
        "payment_ref": reference,
        "payment_confirmed": True,
    }


async def test_uncollected_correction_preserves_receipt_and_replays_without_extra_stock(setup):
    client, factory, _ = setup
    sale, rx, row = await dispensed_sale(client)
    assert sale["items"][0]["prescription_item_id"] == rx["items"][0]["id"]
    body = correction(sale, rx, 2)
    quote = await client.post(f"/v1/sales/{sale['id']}/corrections/quote", json=body)
    assert quote.status_code == 200 and quote.json()["credit_cents"] == 500
    key = uuid4()
    response = await post(client, f"/v1/sales/{sale['id']}/corrections", body, key)
    assert response.status_code == 201, response.text
    assert (
        await post(client, f"/v1/sales/{sale['id']}/corrections", body, key)
    ).json() == response.json()
    current = (await client.get(f"/v1/sales/{sale['id']}")).json()
    assert current["total_cents"] == 1000 and current["items"][0]["quantity"] == 4
    assert current["credited_cents"] == current["refundable_cents"] == 500
    assert current["items"][0]["corrected_quantity"] == 2 and current["version"] == 2
    updated_rx = (await client.get(f"/v1/prescriptions/{rx['id']}")).json()
    assert updated_rx["items"][0]["quantity_dispensed"] == 2 and updated_rx["version"] == 3
    assert (await post(client, f"/v1/sales/{sale['id']}/corrections", body)).status_code == 409
    async with factory() as db:
        assert (await db.get(DrugBatch, UUID(row["id"]))).quantity_on_hand == 18
        assert (
            await db.scalar(
                select(func.sum(StockMovement.delta)).where(
                    StockMovement.batch_id == UUID(row["id"])
                )
            )
            == 18
        )
        assert await db.scalar(select(func.count(SaleCorrection.id))) == 1


async def test_customer_return_preserves_dispense_and_never_restores_available_stock(setup):
    client, factory, _ = setup
    sale, rx, row = await dispensed_sale(client)
    response = await post(
        client, f"/v1/sales/{sale['id']}/corrections", correction(sale, rx, 2, "customer_return")
    )
    assert response.status_code == 201, response.text
    current = (await client.get(f"/v1/prescriptions/{rx['id']}")).json()
    assert current == rx
    async with factory() as db:
        assert (await db.get(DrugBatch, UUID(row["id"]))).quantity_on_hand == 16
        assert (
            await db.scalar(
                select(func.count(StockMovement.id)).where(
                    StockMovement.ref_type == "sale_correction"
                )
            )
            == 0
        )
    history = (await client.get(f"/v1/sales/{sale['id']}/corrections")).json()
    assert history["total"] == 1 and history["items"][0]["kind"] == "customer_return"
    assert history["items"][0]["actor_name"] == "QA Pharmacist"


async def test_correcting_uncollected_units_does_not_reopen_cancelled_prescription(setup):
    client, _, _ = setup
    sale, rx, _ = await dispensed_sale(client)
    response = await post(
        client,
        f"/v1/prescriptions/{rx['id']}/cancel",
        {"version": rx["version"], "reason": "Prescriber cancelled remaining units"},
    )
    assert response.status_code == 200
    rx = response.json()
    assert (
        await post(client, f"/v1/sales/{sale['id']}/corrections", correction(sale, rx, 4))
    ).status_code == 201
    current = (await client.get(f"/v1/prescriptions/{rx['id']}")).json()
    assert current["status"] == "cancelled" and current["items"][0]["quantity_dispensed"] == 0
    assert current["cancellation_reason"] == rx["cancellation_reason"]


async def test_partial_credit_rounding_eventually_equals_original_discounted_taxed_total(setup):
    client, _, _ = setup
    first, second = await drug(client), await drug(client, name="Second item")
    await batch(client, first["id"], selling_price_cents=100)
    await batch(client, second["id"], selling_price_cents=200)
    sale = (
        await post(
            client,
            "/v1/sales",
            {
                "items": [
                    {"drug_id": first["id"], "quantity": 3},
                    {"drug_id": second["id"], "quantity": 2},
                ],
                "discount_cents": 13,
                "tax_cents": 7,
            },
        )
    ).json()
    credit = 0
    for item in sale["items"]:
        for _ in range(item["quantity"]):
            current = (await client.get(f"/v1/sales/{sale['id']}")).json()
            body = {**correction(current), "items": [{"sale_item_id": item["id"], "quantity": 1}]}
            response = await post(client, f"/v1/sales/{sale['id']}/corrections", body)
            assert response.status_code == 201, response.text
            credit += response.json()["credit_cents"]
    assert credit == sale["total_cents"] == 694
    current = (await client.get(f"/v1/sales/{sale['id']}")).json()
    assert current["refundable_cents"] == 694
    assert (
        await post(client, f"/v1/sales/{sale['id']}/corrections", correction(current))
    ).status_code == 400
    assert (
        await post(
            client,
            f"/v1/sales/{sale['id']}/void",
            {"version": current["version"], "reason": "Already corrected"},
        )
    ).status_code == 409


async def test_legacy_line_links_need_admin_evidence_and_preserve_quantities(setup):
    client, factory, actor = setup
    sale, rx, row = await dispensed_sale(client)
    async with factory() as db, db.begin():
        stored = await db.get(SaleItem, UUID(sale["items"][0]["id"]))
        stored.prescription_item_id = None
    assert (
        await post(client, f"/v1/sales/{sale['id']}/corrections", correction(sale, rx))
    ).status_code == 409
    body = {
        "version": sale["version"],
        "prescription_version": rx["version"],
        "reason": "Verified original dispensing sheet",
        "allocations": [
            {"sale_item_id": sale["items"][0]["id"], "prescription_item_id": rx["items"][0]["id"]}
        ],
    }
    actor["role"] = "pharmacist"
    assert (
        await post(client, f"/v1/sales/{sale['id']}/reconcile-prescription", body)
    ).status_code == 403
    actor["role"] = "pharmacy_admin"
    key = uuid4()
    response = await post(client, f"/v1/sales/{sale['id']}/reconcile-prescription", body, key)
    assert response.status_code == 200, response.text
    assert (
        await post(client, f"/v1/sales/{sale['id']}/reconcile-prescription", body, key)
    ).json() == response.json()
    assert response.json()["version"] == 2
    async with factory() as db:
        assert (await db.get(DrugBatch, UUID(row["id"]))).quantity_on_hand == 16
    rx = (await client.get(f"/v1/prescriptions/{rx['id']}")).json()
    assert rx["items"][0]["quantity_dispensed"] == 4 and rx["version"] == 3
    assert (
        await post(client, f"/v1/sales/{sale['id']}/corrections", correction(response.json(), rx))
    ).status_code == 201


async def test_refund_is_limited_to_credit_replays_and_can_correct_an_incorrect_entry(setup):
    client, factory, actor = setup
    sale, rx, row = await dispensed_sale(client)
    path = f"/v1/sales/{sale['id']}"
    assert (await post(client, path + "/refunds", refund(1))).status_code == 400
    assert (await post(client, path + "/corrections", correction(sale, rx, 2))).status_code == 201
    assert (await post(client, path + "/refunds", refund(2, 501))).status_code == 400
    key = uuid4()
    original = await post(client, path + "/refunds", refund(2), key)
    assert original.status_code == 201, original.text
    assert (await post(client, path + "/refunds", refund(2), key)).json() == original.json()
    assert (await post(client, path + "/refunds", refund(3))).status_code == 409
    current = (await client.get(path)).json()
    assert current["refunded_cents"] == current["refundable_cents"] == 250
    void_path = path + f"/refunds/{original.json()['id']}/void"
    void_body = {
        "version": current["version"],
        "reason": "Wrong refund reference entered",
        "entry_was_incorrect": True,
    }
    actor["role"] = "pharmacist"
    assert (await post(client, void_path, void_body)).status_code == 403
    actor["role"] = "pharmacy_admin"
    void_key = uuid4()
    marked = await post(client, void_path, void_body, void_key)
    assert marked.status_code == 200 and marked.json()["status"] == "voided"
    assert (await post(client, void_path, void_body, void_key)).json() == marked.json()
    current = (await client.get(path)).json()
    assert current["refundable_cents"] == 500 and current["refunded_cents"] == 0
    async with factory() as db:
        assert (await db.get(DrugBatch, UUID(row["id"]))).quantity_on_hand == 18
        assert await db.scalar(select(func.count(SaleRefund.id))) == 1


async def test_legacy_same_drug_lines_require_balanced_explicit_mapping(setup):
    client, factory, _ = setup
    item, row = await test_transactions.stocked(client)
    rx = (
        await post(
            client,
            "/v1/prescriptions",
            {
                "items": [
                    {
                        "drug_id": item["id"],
                        "quantity_prescribed": 10,
                        "dosage_instructions": "Morning",
                    },
                    {
                        "drug_id": item["id"],
                        "quantity_prescribed": 10,
                        "dosage_instructions": "Evening",
                    },
                ]
            },
        )
    ).json()
    response = await post(
        client,
        f"/v1/prescriptions/{rx['id']}/dispense",
        {
            "version": rx["version"],
            "items": [{"prescription_item_id": line["id"], "quantity": 2} for line in rx["items"]],
        },
    )
    assert response.status_code == 200, response.text
    sale = (await client.get("/v1/sales/" + response.json()["sale_id"])).json()
    rx = (await client.get("/v1/prescriptions/" + rx["id"])).json()
    verified = [
        {"sale_item_id": line["id"], "prescription_item_id": line["prescription_item_id"]}
        for line in sale["items"]
    ]
    async with factory() as db, db.begin():
        for line in sale["items"]:
            (await db.get(SaleItem, UUID(line["id"]))).prescription_item_id = None
    body = {
        "version": sale["version"],
        "prescription_version": rx["version"],
        "reason": "Paper dispensing record checked",
        "allocations": [
            {**line, "prescription_item_id": rx["items"][0]["id"]} for line in verified
        ],
    }
    path = f"/v1/sales/{sale['id']}/reconcile-prescription"
    assert (await post(client, path, body)).status_code == 409
    # A rejected mapping rolls back all links and revisions, including the first line.
    current = (await client.get("/v1/sales/" + sale["id"])).json()
    assert current["version"] == sale["version"]
    assert all(line["prescription_item_id"] is None for line in current["items"])
    body["allocations"] = verified
    assert (await post(client, path, body)).status_code == 200
    current_rx = (await client.get("/v1/prescriptions/" + rx["id"])).json()
    assert [line["quantity_dispensed"] for line in current_rx["items"]] == [2, 2]
    async with factory() as db:
        assert (await db.get(DrugBatch, UUID(row["id"]))).quantity_on_hand == 16


async def test_inconsistent_legacy_prescription_is_not_silently_reopened(setup):
    client, factory, _ = setup
    sale, rx, _ = await dispensed_sale(client)
    async with factory() as db, db.begin():
        (await db.get(Prescription, UUID(rx["id"]))).status = "legacy_unknown"
    response = await post(client, f"/v1/sales/{sale['id']}/corrections", correction(sale, rx))
    assert response.status_code == 409 and "historical" in response.text
    assert (await client.get(f"/v1/sales/{sale['id']}/corrections")).json()["total"] == 0


async def test_correction_failure_rolls_back_credit_rx_stock_and_request_receipt(
    setup, monkeypatch
):
    client, factory, _ = setup
    sale, rx, row = await dispensed_sale(client)
    key = uuid4()

    async def fail(*args):
        raise HTTPException(503, "Receipt unavailable")

    monkeypatch.setattr(inventory_requests, "finish_request", fail)
    assert (
        await post(client, f"/v1/sales/{sale['id']}/corrections", correction(sale, rx), key)
    ).status_code == 503
    async with factory() as db:
        assert await db.get(InventoryRequest, key) is None
        assert await db.scalar(select(func.count(SaleCorrection.id))) == 0
        assert (await db.get(DrugBatch, UUID(row["id"]))).quantity_on_hand == 16
        assert (await db.get(Prescription, UUID(rx["id"]))).version == rx["version"]


async def test_reports_show_later_credit_and_refund_without_double_subtraction(setup):
    client, factory, _ = setup
    sale, rx, _ = await dispensed_sale(client)
    async with factory() as db, db.begin():
        stored = await db.get(Sale, UUID(sale["id"]))
        stored.created_at = stored.completed_at = datetime.now(UTC) - timedelta(days=3)
    assert (
        await post(client, f"/v1/sales/{sale['id']}/corrections", correction(sale, rx, 2))
    ).status_code == 201
    assert (await post(client, f"/v1/sales/{sale['id']}/refunds", refund(2))).status_code == 201
    params = {"start": date.today().isoformat(), "end": date.today().isoformat()}
    summary = (await client.get("/v1/reports/sales-summary", params=params)).json()
    assert summary["gross_total_cents"] == 0 and summary["credit_total_cents"] == 500
    assert summary["refund_total_cents"] == 250 and summary["net_sales_cents"] == -500
    daily = (await client.get("/v1/reports/sales-daily", params=params)).json()["items"]
    assert len(daily) == 1 and daily[0]["sale_count"] == 0 and daily[0]["net_sales_cents"] == -500
    top = (await client.get("/v1/reports/top-drugs")).json()["items"]
    assert top[0]["units_sold"] == 2 and top[0]["revenue_cents"] == 500


@pytest.mark.parametrize(
    "change",
    [{"stock_confirmed": False}, {"kind": "restock_return"}, {"reason": " "}, {"unexpected": "x"}],
)
async def test_invalid_correction_inputs_are_rejected_without_mutation(setup, change):
    client, _, _ = setup
    sale, rx, _ = await dispensed_sale(client)
    response = await post(
        client, f"/v1/sales/{sale['id']}/corrections", {**correction(sale, rx), **change}
    )
    assert response.status_code == 422
    assert (await client.get(f"/v1/sales/{sale['id']}/corrections")).json()["total"] == 0


async def test_cashiers_cannot_correct_refund_or_replay_a_pharmacist_write(setup):
    client, _, actor = setup
    sale, rx, _ = await dispensed_sale(client)
    key = uuid4()
    body = correction(sale, rx)
    path = f"/v1/sales/{sale['id']}"
    assert (await post(client, path + "/corrections", body, key)).status_code == 201
    actor["role"] = "cashier"
    assert (await post(client, path + "/corrections", body, key)).status_code == 403
    assert (await client.post(path + "/corrections/quote", json=body)).status_code == 403
    assert (await post(client, path + "/refunds", refund(2))).status_code == 403
    assert (await client.get(path + "/corrections")).status_code == 200


async def test_top_drug_period_matches_receipt_completion_date(setup):
    client, factory, _ = setup
    sale, _, _ = await dispensed_sale(client)
    async with factory() as db, db.begin():
        stored = await db.get(Sale, UUID(sale["id"]))
        stored.created_at = datetime.now(UTC) - timedelta(days=3)
        stored.completed_at = datetime.now(UTC)
    params = {"start": date.today().isoformat(), "end": date.today().isoformat()}
    summary = (await client.get("/v1/reports/sales-summary", params=params)).json()
    top = (await client.get("/v1/reports/top-drugs", params=params)).json()["items"]
    assert summary["sale_count"] == 1 and summary["gross_total_cents"] == 1000
    assert len(top) == 1 and top[0]["units_sold"] == 4
