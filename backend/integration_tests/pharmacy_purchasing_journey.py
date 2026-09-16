"""Real concurrent purchase receipts, cancellation and legacy stock reconciliation."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from threading import Barrier
from uuid import uuid4

import psycopg


def purchasing_journey(client, urls, databases, staff_headers):
    base = urls["pms"] + "/v1"

    def post(path, body, key=None):
        return client.post(
            base + path,
            json=body,
            headers={**staff_headers, "Idempotency-Key": str(key or uuid4())},
        )

    def ok(response, status=200):
        assert response.status_code == status, response.text
        return response.json()

    def together(action):
        barrier = Barrier(2)

        def perform(index):
            barrier.wait(timeout=10)
            return action(index)

        with ThreadPoolExecutor(max_workers=2) as pool:
            return list(pool.map(perform, range(2)))

    def create_drug(name):
        return ok(
            post(
                "/drugs",
                {
                    "name": name,
                    "category": "general",
                    "form": "tablet",
                    "strength": "10 mg",
                    "unit": "tablet",
                    "default_selling_price_cents": 400,
                },
            ),
            201,
        )

    drugs = [create_drug("Purchasing QA A"), create_drug("Purchasing QA B")]
    supplier = ok(post("/suppliers", {"name": "Purchasing supplier"}), 201)
    body = {
        "supplier_id": supplier["id"],
        "items": [
            {"drug_id": drug["id"], "quantity": 10 if index == 0 else 8, "unit_cost_cents": 200}
            for index, drug in enumerate(drugs)
        ],
    }
    key = uuid4()
    created = together(lambda _: post("/purchase-orders", body, key))
    po = ok(created[0], 201)
    assert ok(created[1], 201) == po
    path = "/purchase-orders/" + po["id"]
    body["items"][0]["quantity"] = 12
    po = ok(
        client.patch(
            base + path,
            json={**body, "version": po["version"]},
            headers={**staff_headers, "Idempotency-Key": str(uuid4())},
        )
    )
    po = ok(post(path + "/send", {"version": po["version"]}))
    by_drug = {item["drug_id"]: item for item in po["items"]}
    expiry = (date.today() + timedelta(days=30)).isoformat()
    first_line = {
        "purchase_order_item_id": by_drug[drugs[0]["id"]]["id"],
        "quantity_received": 3,
        "batch_number": "FIRST-LOT",
        "expiry_date": expiry,
    }
    delivery = {
        "version": po["version"],
        "received_at": date.today().isoformat(),
        "delivery_reference": "QA-DELIVERY",
        "lines": [
            first_line,
            {
                **first_line,
                "quantity_received": 2,
                "batch_number": "SECOND-LOT",
                "selling_price_cents": 0,
            },
        ],
    }
    key = uuid4()
    received = together(lambda _: post(path + "/receive", delivery, key))
    po = ok(received[0])
    assert ok(received[1]) == po and po["status"] == "partially_received"
    assert sum(item["quantity_received"] for item in po["items"]) == 5
    assert sum(item["quantity_outstanding"] for item in po["items"]) == 15
    remaining = {
        "version": po["version"],
        "received_at": date.today().isoformat(),
        "lines": [
            {
                "purchase_order_item_id": item["id"],
                "quantity_received": item["quantity_outstanding"],
                "batch_number": "REMAINDER",
                "expiry_date": expiry,
            }
            for item in po["items"]
        ],
    }
    results = together(
        lambda index: (
            post(path + "/receive", remaining)
            if index == 0
            else post(
                path + "/cancel",
                {"version": po["version"], "reason": "Supplier cancelled remaining delivery"},
            )
        )
    )
    assert sorted(r.status_code for r in results) == [200, 409], [r.text for r in results]
    saved = ok(client.get(base + path, headers=staff_headers))
    history = ok(client.get(base + path + "/history", headers=staff_headers))
    assert [event["details"]["version"] for event in history["items"]] == [5, 4, 3, 2, 1]
    assert saved["status"] in ("received", "cancelled")
    assert sum(item["quantity_received"] for item in saved["items"]) == (
        20 if saved["status"] == "received" else 5
    )
    assert sum(item["quantity_outstanding"] for item in saved["items"]) == 0
    batches = ok(
        client.get(base + "/batches", headers=staff_headers, params={"purchase_order_id": po["id"]})
    )["items"]
    assert sum(batch["quantity_received"] for batch in batches) == sum(
        item["quantity_received"] for item in saved["items"]
    )
    assert len([batch for batch in batches if batch["batch_number"] == "FIRST-LOT"]) == 1
    assert (
        next(batch for batch in batches if batch["batch_number"] == "SECOND-LOT")[
            "selling_price_cents"
        ]
        == 0
    )

    # Reconciliation racing a POS write must preserve the newly committed batch revision.
    legacy_drug = create_drug("Legacy purchasing QA")
    legacy = ok(
        post(
            "/purchase-orders",
            {
                "supplier_id": supplier["id"],
                "items": [{"drug_id": legacy_drug["id"], "quantity": 10, "unit_cost_cents": 100}],
            },
        ),
        201,
    )
    batch_id = uuid4()
    with psycopg.connect(databases["pms"]) as db:
        db.execute(
            "UPDATE purchase_orders SET receiving_reconciled=false,status='received' WHERE id=%s",
            (legacy["id"],),
        )
        db.execute(
            "INSERT INTO drug_batches(id,drug_id,purchase_order_id,batch_number,quantity_received,quantity_on_hand,unit_cost_cents,selling_price_cents,received_at,expiry_date) VALUES(%s,%s,%s,'LEGACY-LOT',8,5,100,400,CURRENT_DATE,%s)",
            (batch_id, legacy_drug["id"], legacy["id"], expiry),
        )
        for delta, reason in [(8, "receive"), (-3, "sale")]:
            db.execute(
                "INSERT INTO stock_movements(id,drug_id,batch_id,delta,reason,note) VALUES(%s,%s,%s,%s,%s,'Synthetic historical movement')",
                (uuid4(), legacy_drug["id"], batch_id, delta, reason),
            )
    reconcile = {
        "version": 1,
        "note": "Matched historical delivery documents",
        "allocations": [
            {"batch_id": str(batch_id), "purchase_order_item_id": legacy["items"][0]["id"]}
        ],
    }
    result = together(
        lambda index: (
            post("/purchase-orders/" + legacy["id"] + "/reconcile", reconcile)
            if index == 0
            else post("/sales", {"items": [{"drug_id": legacy_drug["id"], "quantity": 4}]})
        )
    )
    assert [r.status_code for r in result] == [200, 201], [r.text for r in result]
    assert result[0].json()["items"][0]["quantity_received"] == 8
    with psycopg.connect(databases["pms"]) as db:
        assert db.execute(
            "SELECT quantity_on_hand,version,purchase_order_item_id IS NOT NULL FROM drug_batches WHERE id=%s",
            (batch_id,),
        ).fetchone() == (1, 3, True)
        assert all(
            balance == ledger
            for balance, ledger in db.execute(
                "SELECT b.quantity_on_hand,sum(m.delta) FROM drug_batches b JOIN stock_movements m ON m.batch_id=b.id GROUP BY b.id"
            ).fetchall()
        )
