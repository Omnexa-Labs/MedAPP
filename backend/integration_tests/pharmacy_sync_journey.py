"""Real HTTP, PostgreSQL and separate-process outbox recovery."""

import hashlib
import hmac
import json
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from uuid import UUID, uuid4

import psycopg
from shared.pharmacy_sync import SYNC_PATH, encode, sign
from test_hospital_activation import BACKEND, account


def sync_journey(client, urls, databases, staff, other_patient, env, secret):
    _, patient, identity = account(client, urls, databases)
    base = urls["pms"] + "/v1"
    endpoint = urls["api_gateway"] + SYNC_PATH
    worker_env = {**env, "PMS_MEDAPP_SYNC_URL": endpoint}

    def ok(response, status=200):
        assert response.status_code == status, response.text
        return response.json()

    def post(path, body, key=None):
        return client.post(
            base + path, json=body, headers={**staff, "Idempotency-Key": str(key or uuid4())}
        )

    def together(action):
        with ThreadPoolExecutor(max_workers=2) as pool:
            return list(pool.map(action, range(2)))

    def worker(environment=worker_env, script=None):
        command = (
            [sys.executable, "-c", script]
            if script
            else [sys.executable, "-m", "app.workers.medapp_sync", "--once"]
        )
        completed = subprocess.run(
            command,
            cwd=BACKEND / "services/pms_service",
            env=environment,
            capture_output=True,
            text=True,
            timeout=30,
        )
        assert completed.returncode == 0, completed.stderr

    drug = ok(
        post(
            "/drugs",
            {
                "name": "Sync QA medicine",
                "category": "other",
                "form": "tablet",
                "strength": "10 mg",
                "unit": "tablet",
            },
        ),
        201,
    )
    batch = ok(
        post(
            "/batches",
            {
                "drug_id": drug["id"],
                "batch_number": "SYNC-QA",
                "quantity_received": 100,
                "unit_cost_cents": 10,
                "selling_price_cents": 100,
                "received_at": date.today().isoformat(),
                "expiry_date": (date.today() + timedelta(days=30)).isoformat(),
            },
        ),
        201,
    )
    payload = {
        "external_ref": str(uuid4()),
        "customer_medapp_user_id": identity["id"],
        "customer_full_name": "QA Patient",
        "items": [
            {"drug_name": drug["name"], "drug_id_hint": drug["id"], "quantity_prescribed": 10}
        ],
    }
    raw = json.dumps(payload).encode()
    headers = {
        "X-MedApp-Signature": "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    }
    incoming = together(
        lambda _: client.post(
            base + "/integrations/medapp/prescriptions", content=raw, headers=headers
        )
    )
    accepted = ok(incoming[0], 201)
    assert ok(incoming[1], 201) == accepted
    rx_path = "/prescriptions/" + accepted["prescription_id"]
    rx = ok(client.get(base + rx_path, headers=staff))
    # The first delivery fails in a separate worker; no clinical operation rolls back.
    worker({**worker_env, "PMS_MEDAPP_SYNC_URL": "http://127.0.0.1:1" + SYNC_PATH})
    events = ok(client.get(base + rx_path + "/medapp-deliveries", headers=staff))
    assert events["items"][0]["state"] == "retry" and events["items"][0]["attempts"] == 1
    key = uuid4()
    dispense = {
        "version": 1,
        "items": [{"prescription_item_id": rx["items"][0]["id"], "quantity": 4}],
    }
    responses = together(lambda _: post(rx_path + "/dispense", dispense, key))
    saved = ok(responses[0])
    assert ok(responses[1]) == saved
    for kind in ["customer_return", "not_collected"]:
        sale = ok(client.get(base + "/sales/" + saved["sale_id"], headers=staff))
        rx = ok(client.get(base + rx_path, headers=staff))
        body = {
            "version": sale["version"],
            "prescription_version": rx["version"],
            "kind": kind,
            "reason": "Confirmed by QA pharmacist",
            "stock_confirmed": True,
            "items": [{"sale_item_id": sale["items"][0]["id"], "quantity": 1}],
        }
        key = uuid4()
        responses = together(
            lambda _, sale=sale, body=body, key=key: post(
                "/sales/" + sale["id"] + "/corrections", body, key
            )
        )
        assert ok(responses[0], 201) == ok(responses[1], 201)
    rx = ok(client.get(base + rx_path, headers=staff))
    ok(
        post(
            rx_path + "/cancel",
            {"version": rx["version"], "reason": "Prescriber cancelled remaining units"},
        )
    )
    with psycopg.connect(databases["pms"]) as db:
        rows = db.execute(
            "SELECT payload FROM medapp_deliveries WHERE prescription_id=%s ORDER BY sequence",
            (rx["id"],),
        ).fetchall()
        assert len(rows) == 5
        latest = rows[-1][0]
        assert latest["snapshot"]["items"][0]["quantity_dispensed"] == 3
        assert latest["snapshot"]["items"][0]["quantity_returned"] == 1
        assert db.execute(
            "SELECT quantity_on_hand FROM drug_batches WHERE id=%s", (batch["id"],)
        ).fetchone() == (97,)
        # An editable customer identity cannot change the verified recipient.
        db.execute(
            "UPDATE customers SET medapp_user_id=%s WHERE id=%s", (str(uuid4()), rx["customer_id"])
        )
    assert client.post(endpoint, json=latest).status_code == 401
    raw = encode(latest)
    timestamp = str(int(time.time()))
    signed = {
        "X-MedApp-Deployment": "accra",
        "X-MedApp-Timestamp": timestamp,
        "X-MedApp-Signature": sign(raw, secret, timestamp),
    }
    # The receiver commits the latest report before its predecessors. A lost
    # worker acknowledgement leaves the matching outbox row pending.
    receipts = together(lambda _: client.post(endpoint, content=raw, headers=signed))
    assert ok(receipts[0]) == ok(receipts[1])
    assert receipts[0].json()["applied"] is True
    # Claim in a worker process that exits before sending, then expire its lease.
    worker(
        script="import asyncio; from app.db import SessionLocal; from app.services.medapp_delivery import claim; asyncio.run(claim(SessionLocal))"
    )
    with psycopg.connect(databases["pms"]) as db:
        assert db.execute(
            "SELECT count(*) FROM medapp_deliveries WHERE state='sending'"
        ).fetchone() == (1,)
        db.execute(
            "UPDATE medapp_deliveries SET leased_until=now()-interval '1 second' WHERE state='sending'"
        )
        db.execute(
            "UPDATE medapp_deliveries SET next_attempt_at=now()-interval '1 second' WHERE state='retry'"
        )
    together(lambda _: worker())
    events = ok(client.get(base + rx_path + "/medapp-deliveries", headers=staff))
    assert events["total"] == 5 and all(row["state"] == "delivered" for row in events["items"])
    assert any(row["attempts"] > 1 for row in events["items"])
    history = urls["api_gateway"] + "/v1/me/pharmacy-prescriptions"
    response = client.get(history, headers=patient)
    records = ok(response)
    assert response.headers["cache-control"] == "private, no-store"
    assert records["total"] == 1
    record = records["items"][0]
    assert record["sequence"] == 5 and record["snapshot"]["status"] == "cancelled"
    assert ok(client.get(history + "/" + record["id"], headers=patient)) == record
    assert client.get(history + "/" + record["id"], headers=other_patient).status_code == 404
    assert ok(client.get(history, headers=other_patient))["items"] == []
    assert client.get(history).status_code == 401
    with psycopg.connect(databases["pharmacy"]) as db:
        assert db.execute(
            "SELECT count(*) FROM pharmacy_prescriptions WHERE patient_id=%s", (identity["id"],)
        ).fetchone() == (1,)
        assert db.execute("SELECT count(*) FROM pharmacy_prescription_events").fetchone() == (5,)
    with psycopg.connect(databases["pms"]) as db:
        assert db.execute(
            "SELECT sync_sequence, medapp_patient_id FROM prescriptions WHERE id=%s", (rx["id"],)
        ).fetchone() == (5, UUID(identity["id"]))
