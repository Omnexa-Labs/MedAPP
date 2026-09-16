"""Correction/refund races use the real PostgreSQL locks and authenticated API."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from threading import Barrier
from uuid import uuid4

import psycopg


def corrections_journey(client, urls, databases, staff_headers):
    base = urls["pms"] + "/v1"

    def post(path, body, key=None):
        return client.post(
            base + path,
            json=body,
            headers={**staff_headers, "Idempotency-Key": str(key or uuid4())},
        )

    def get(path):
        return ok(client.get(base + path, headers=staff_headers))

    def ok(response, code=200):
        assert response.status_code == code, response.text
        return response.json()

    def together(action):
        barrier = Barrier(2)

        def run(index):
            barrier.wait(timeout=10)
            return action(index)

        with ThreadPoolExecutor(max_workers=2) as pool:
            return list(pool.map(run, range(2)))

    drug = ok(
        post(
            "/drugs",
            {
                "name": "Corrections QA",
                "category": "other",
                "form": "tablet",
                "strength": "5 mg",
                "unit": "tablet",
                "default_selling_price_cents": 125,
                "requires_prescription": True,
            },
        ),
        201,
    )
    batch = ok(
        post(
            "/batches",
            {
                "drug_id": drug["id"],
                "batch_number": "CR-LOT",
                "quantity_received": 50,
                "unit_cost_cents": 50,
                "selling_price_cents": 125,
                "received_at": date.today().isoformat(),
                "expiry_date": (date.today() + timedelta(days=30)).isoformat(),
            },
        ),
        201,
    )
    rx = ok(
        post(
            "/prescriptions",
            {
                "prescriber_name": "Dr QA",
                "items": [
                    {
                        "drug_id": drug["id"],
                        "quantity_prescribed": 10,
                        "dosage_instructions": "First course",
                    },
                    {
                        "drug_id": drug["id"],
                        "quantity_prescribed": 10,
                        "dosage_instructions": "Second course",
                    },
                ],
            },
        ),
        201,
    )
    dispensed = ok(
        post(
            f"/prescriptions/{rx['id']}/dispense",
            {
                "version": 1,
                "items": [
                    {"prescription_item_id": item["id"], "quantity": 4} for item in rx["items"]
                ],
            },
        )
    )
    sale = get("/sales/" + dispensed["sale_id"])
    rx = get("/prescriptions/" + rx["id"])
    path = "/sales/" + sale["id"]
    body = {
        "version": sale["version"],
        "prescription_version": rx["version"],
        "kind": "not_collected",
        "stock_confirmed": True,
        "reason": "Never collected; original batch verified",
        "items": [{"sale_item_id": sale["items"][0]["id"], "quantity": 2}],
    }
    key = uuid4()
    responses = together(lambda _: post(path + "/corrections", body, key))
    correction = ok(responses[0], 201)
    assert ok(responses[1], 201) == correction and correction["credit_cents"] == 250
    assert get(path)["version"] == 2
    rx = get("/prescriptions/" + rx["id"])
    assert rx["version"] == 3 and sum(item["quantity_dispensed"] for item in rx["items"]) == 6

    # A second correction and another dispense share the same saved Rx revision.
    body2 = {
        **body,
        "version": 2,
        "prescription_version": 3,
        "items": [{"sale_item_id": sale["items"][0]["id"], "quantity": 1}],
    }
    competing = together(
        lambda i: (
            post(path + "/corrections", body2)
            if i == 0
            else post(
                f"/prescriptions/{rx['id']}/dispense",
                {
                    "version": 3,
                    "items": [{"prescription_item_id": rx["items"][0]["id"], "quantity": 1}],
                },
            )
        )
    )
    assert sum(response.status_code == 409 for response in competing) == 1, [
        r.text for r in competing
    ]
    assert all(response.status_code in (200, 201, 409) for response in competing)
    current = get(path)
    rx = get("/prescriptions/" + rx["id"])
    balance = 50 - sum(item["quantity_dispensed"] for item in rx["items"])
    with psycopg.connect(databases["pms"]) as db:
        assert db.execute(
            "SELECT quantity_on_hand FROM drug_batches WHERE id=%s", (batch["id"],)
        ).fetchone() == (balance,)
        assert db.execute(
            "SELECT sum(delta) FROM stock_movements WHERE batch_id=%s", (batch["id"],)
        ).fetchone() == (balance,)

    # Customer returns credit the receipt without changing the clinical or usable balance.
    returned = {
        **body,
        "version": current["version"],
        "prescription_version": rx["version"],
        "kind": "customer_return",
        "items": [{"sale_item_id": sale["items"][1]["id"], "quantity": 1}],
    }
    ok(post(path + "/corrections", returned), 201)
    assert get("/prescriptions/" + rx["id"]) == rx
    current = get(path)
    refund_body = {
        "version": current["version"],
        "amount_cents": current["refundable_cents"],
        "payment_method": "cash",
        "payment_ref": "CR-QA-CASH-REFUND",
        "reason": "Refund completed at counter",
        "payment_confirmed": True,
    }
    refund_key = uuid4()
    responses = together(lambda _: post(path + "/refunds", refund_body, refund_key))
    refund = ok(responses[0], 201)
    assert ok(responses[1], 201) == refund
    current = get(path)
    assert current["refundable_cents"] == 0
    assert (
        post(
            path + "/refunds",
            {**refund_body, "version": current["version"], "payment_ref": "ANOTHER-REF"},
        ).status_code
        == 400
    )
    assert ok(post(path + "/corrections", body, key), 201) == correction
    history = get(path + "/corrections")
    assert history["total"] == (3 if competing[0].status_code == 201 else 2)
    with psycopg.connect(databases["pms"]) as db:
        assert db.execute(
            "SELECT quantity_on_hand FROM drug_batches WHERE id=%s", (batch["id"],)
        ).fetchone() == (balance,)
        assert db.execute(
            "SELECT count(*) FROM sale_refunds WHERE sale_id=%s", (sale["id"],)
        ).fetchone() == (1,)
        assert db.execute(
            "SELECT sum(credit_cents) FROM sale_corrections WHERE sale_id=%s", (sale["id"],)
        ).fetchone() == (refund["amount_cents"],)
