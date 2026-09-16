"""Exercise stock writers through authenticated HTTP against real PostgreSQL."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from threading import Barrier
from uuid import uuid4

import psycopg


def inventory_journey(client, urls, databases, staff_headers, owner, public_pharmacy):
    base = urls["pms"] + "/v1"

    def post(path, body, key=None):
        return client.post(
            base + path,
            json=body,
            headers={**staff_headers, "Idempotency-Key": str(key or uuid4())},
        )

    def ok(response, code=200):
        assert response.status_code == code, response.text
        return response.json()

    def together(action):
        barrier = Barrier(2)

        def perform(index):
            barrier.wait(timeout=10)
            return action(index)

        with ThreadPoolExecutor(max_workers=2) as pool:
            return list(pool.map(perform, range(2)))

    drug = ok(
        post(
            "/drugs",
            {
                "name": "Paracetamol",
                "category": "analgesic",
                "form": "tablet",
                "strength": "500 mg",
                "unit": "tablet",
                "sku": "QA-PARA",
                "default_selling_price_cents": 300,
            },
        ),
        201,
    )
    receipt = {
        "drug_id": drug["id"],
        "batch_number": "QA-CONCURRENT",
        "quantity_received": 20,
        "unit_cost_cents": 100,
        "received_at": date.today().isoformat(),
        "expiry_date": (date.today() + timedelta(days=30)).isoformat(),
    }
    receipt_key = uuid4()
    receipts = together(lambda _: post("/batches", receipt, receipt_key))
    batch = ok(receipts[0], 201)
    assert ok(receipts[1], 201) == batch
    path = "/batches/" + batch["id"]
    adjust = {"version": 1, "delta": -2, "reason": "adjust", "note": "Damaged packaging"}
    results = together(lambda _: post(path + "/adjust", adjust))
    assert sorted(r.status_code for r in results) == [200, 409]

    sale_body = {"items": [{"drug_id": drug["id"], "quantity": 12}], "payment_method": "cash"}
    sales = together(lambda _: post("/sales", sale_body))
    assert sorted(r.status_code for r in sales) == [201, 400], [r.text for r in sales]
    sale = next(r.json() for r in sales if r.status_code == 201)
    voids = together(lambda _: post("/sales/" + sale["id"] + "/void", {"version": 1, "reason": "All goods retained"}))
    assert sorted(r.status_code for r in voids) == [200, 409], [r.text for r in voids]

    rx = ok(
        post(
            "/prescriptions",
            {
                "items": [
                    {
                        "drug_id": drug["id"],
                        "quantity_prescribed": 12,
                    }
                ],
            },
        ),
        201,
    )
    dispense_body = {
        "version": 1,
        "items": [{"prescription_item_id": rx["items"][0]["id"], "quantity": 12}],
        "payment_method": "cash",
    }
    dispenses = together(lambda _: post("/prescriptions/" + rx["id"] + "/dispense", dispense_body))
    assert sorted(r.status_code for r in dispenses) == [200, 409], [r.text for r in dispenses]
    rx_sale = next(r.json()["sale_id"] for r in dispenses if r.status_code == 200)
    assert post("/sales/" + rx_sale + "/void", {"version": 1, "reason": "Retained goods"}).status_code == 400

    # A versioned count correction racing a sale either wins first or detects the newer balance.
    results = together(
        lambda index: (
            post(
                path + "/adjust",
                {"version": 5, "delta": 2, "reason": "adjust", "note": "Count correction"},
            )
            if index == 0
            else post(
                "/sales",
                {"items": [{"drug_id": drug["id"], "quantity": 6}], "payment_method": "cash"},
            )
        )
    )
    assert results[0].status_code in (200, 409) and results[1].status_code == 201, [
        r.text for r in results
    ]
    expected = 2 if results[0].status_code == 200 else 0

    supplier = ok(post("/suppliers", {"name": "QA Supplier"}), 201)
    po = ok(
        post(
            "/purchase-orders",
            {
                "supplier_id": supplier["id"],
                "items": [{"drug_id": drug["id"], "quantity": 5, "unit_cost_cents": 100}],
            },
        ),
        201,
    )
    po = ok(post("/purchase-orders/" + po["id"] + "/send", {"version": po["version"]}))
    goods = {
        "version": po["version"],
        "received_at": date.today().isoformat(),
        "lines": [
            {
                "purchase_order_item_id": po["items"][0]["id"],
                "quantity_received": 5,
                "batch_number": "QA-PO",
                "expiry_date": receipt["expiry_date"],
            }
        ],
    }
    received = together(lambda _: post("/purchase-orders/" + po["id"] + "/receive", goods))
    assert sorted(r.status_code for r in received) == [200, 409], [r.text for r in received]

    # Old request receipts return their original snapshot; fresh reads carry the current balances.
    assert ok(post("/batches", receipt, receipt_key), 201) == batch
    current = ok(
        client.get(base + "/batches", headers=staff_headers, params={"drug_id": drug["id"]})
    )
    assert len(current["items"]) == 2
    assert sum(row["quantity_on_hand"] for row in current["items"]) == expected + 5
    assert all(row["selling_price_cents"] == 300 for row in current["items"])
    history = ok(client.get(base + path + "/movements", headers=staff_headers))
    assert sum(row["delta"] for row in history["items"]) == expected
    assert all(row["actor_name"] for row in history["items"])
    for period in ("today", "week"):
        dashboard = ok(
            client.get(
                base + "/reports/dashboard", params={"period": period}, headers=staff_headers
            )
        )
        assert sum(point["count"] for point in dashboard["volume"]) == 2
        assert (
            dashboard["sales"]["sale_count"] == 2
            and dashboard["sales"]["gross_total_cents"] == 5400
        )
        assert dashboard["pending_prescriptions"] == 0
    badge = ok(
        client.get(public_pharmacy + "/stock", params={"drug_name": "Paracetamol"}, headers=owner)
    )
    assert badge["source"] == "pms" and badge["quantity"] == expected + 5
    with psycopg.connect(databases["pms"]) as db:
        assert db.execute(
            "SELECT count(*) FROM drug_batches WHERE batch_number='QA-CONCURRENT'"
        ).fetchone() == (1,)
        rows = db.execute(
            "SELECT b.quantity_on_hand, sum(m.delta) FROM drug_batches b "
            "JOIN stock_movements m ON m.batch_id=b.id GROUP BY b.id"
        ).fetchall()
        assert all(balance == ledger for balance, ledger in rows)
