"""Concurrent request recovery through authenticated HTTP and PostgreSQL."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from threading import Barrier
from uuid import uuid4

import psycopg


def transactions_journey(client, urls, databases, staff_headers):
    base = urls["pms"] + "/v1"

    def post(path, body, key=None):
        return client.post(base + path, json=body, headers={**staff_headers, "Idempotency-Key": str(key or uuid4())})

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

    drug = ok(post("/drugs", {"name": "Transaction QA", "category": "other", "form": "tablet", "strength": "10 mg", "unit": "tablet", "default_selling_price_cents": 999}), 201)
    batch = ok(post("/batches", {"drug_id": drug["id"], "batch_number": "TXN-LOT", "quantity_received": 100, "unit_cost_cents": 50, "selling_price_cents": 125, "received_at": date.today().isoformat(), "expiry_date": (date.today() + timedelta(days=30)).isoformat()}), 201)
    body = {"items": [{"drug_id": drug["id"], "quantity": 3}], "payment_method": "mobile_money", "payment_ref": "QA-PAYMENT", "notes": "Collected at counter", "expected_total_cents": 375}
    key = uuid4()
    sales = together(lambda _: post("/sales", body, key))
    sale = ok(sales[0], 201)
    assert ok(sales[1], 201) == sale
    assert ok(post("/sales", body, key), 201) == sale
    assert post("/sales", {**body, "notes": "Changed"}, key).status_code == 409
    void_key = uuid4()
    void_body = {"version": 1, "reason": "All goods retained at counter"}
    voids = together(lambda _: post("/sales/" + sale["id"] + "/void", void_body, void_key))
    voided = ok(voids[0])
    assert ok(voids[1]) == voided and voided["version"] == 2
    assert ok(post("/sales", body, key), 201) == sale
    rx_body = {"prescriber_name": "Dr QA", "items": [{"drug_id": drug["id"], "quantity_prescribed": 10}]}
    rx_key = uuid4()
    rxs = together(lambda _: post("/prescriptions", rx_body, rx_key))
    rx = ok(rxs[0], 201)
    assert ok(rxs[1], 201) == rx
    rx_path = "/prescriptions/" + rx["id"]
    dispense = {"version": 1, "items": [{"prescription_item_id": rx["items"][0]["id"], "quantity": 2}], "notes": "Instructions checked", "expected_total_cents": 250}
    quote = ok(post(rx_path + "/quote", dispense))
    assert quote["total_cents"] == 250
    dispense_key = uuid4()
    dispenses = together(lambda _: post(rx_path + "/dispense", dispense, dispense_key))
    dispensed = ok(dispenses[0])
    assert ok(dispenses[1]) == dispensed and dispensed["rx_version"] == 2
    assert post(rx_path + "/dispense", dispense).status_code == 409
    # A different partial dispense and cancellation use the same saved revision.
    race = together(lambda index: post(rx_path + ("/dispense" if index == 0 else "/cancel"), {**dispense, "version": 2} if index == 0 else {"version": 2, "reason": "Patient declined remaining units"}))
    assert sorted(r.status_code for r in race) == [200, 409], [r.text for r in race]
    current = ok(client.get(base + rx_path, headers=staff_headers))
    quantity = 4 if race[0].status_code == 200 else 2
    assert current["version"] == 3 and current["items"][0]["quantity_dispensed"] == quantity
    assert ok(post(rx_path + "/dispense", dispense, dispense_key)) == dispensed
    # Price review must be rechecked after an intervening price change.
    with psycopg.connect(databases["pms"]) as db:
        db.execute("UPDATE drug_batches SET selling_price_cents=150 WHERE id=%s", (batch["id"],))
    assert post("/sales", body).status_code == 409
    with psycopg.connect(databases["pms"]) as db:
        assert db.execute("SELECT quantity_on_hand FROM drug_batches WHERE id=%s", (batch["id"],)).fetchone() == (100 - quantity,)
        assert db.execute("SELECT sum(delta) FROM stock_movements WHERE batch_id=%s", (batch["id"],)).fetchone() == (100 - quantity,)
        assert db.execute("SELECT count(*) FROM sales WHERE prescription_id=%s", (rx["id"],)).fetchone() == (quantity // 2,)
        assert db.execute("SELECT count(*) FROM inventory_requests WHERE id IN (%s,%s,%s,%s)", (key, void_key, rx_key, dispense_key)).fetchone() == (4,)
    ledger = ok(client.get(base + "/sales", headers=staff_headers, params={"prescription_id": rx["id"], "limit": 1}))
    assert ledger["total"] == quantity // 2 and len(ledger["items"]) == 1
