"""Real accounts, approved doctor receipts, EHR commands, workers, dispensing and isolation."""

import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import psycopg
from medication_journey import medication_journey
from test_hospital_activation import BACKEND, PASSWORD, account, result


def prescribing_journey(client, urls, databases, staff, env, pharmacy_id):
    email, old_doctor_token, doctor_identity = account(client, urls, databases)
    _, patient, patient_identity = account(client, urls, databases)
    _, other, _ = account(client, urls, databases)
    _, _, reviewer = account(client, urls, databases, admin=True)
    patient_id = patient_identity["id"]
    approval = {
        "application_id": str(uuid4()),
        "applicant_id": doctor_identity["id"],
        "reviewer_id": reviewer["id"],
        "approval_version": 1,
        "role": "doctor",
        "first_name": "QA",
        "last_name": "Prescriber",
    }
    activated = result(
        client.post(
            urls["doctor"] + "/internal/professional-activations",
            json=approval,
            headers={"X-Activation-Secret": env["DOCTOR_ONBOARDING_ACTIVATION_SECRET"]},
        )
    )
    result(
        client.post(
            urls["user"] + "/internal/professional-activations",
            json={**approval, "profile_id": activated["resource_id"]},
            headers={"X-Activation-Secret": env["USER_ONBOARDING_ACTIVATION_SECRET"]},
        )
    )
    tokens = result(
        client.post(
            urls["user"] + "/auth/login",
            json={"email": email, "password": PASSWORD},
            headers={"X-Device-Id": email},
        )
    )
    doctor = {"Authorization": "Bearer " + tokens["access_token"]}
    root = urls["api_gateway"] + f"/v1/patients/{patient_id}"
    path = root + "/prescriptions"

    def post(url, body, actor=doctor, key=None):
        return client.post(
            url, json=body, headers={**actor, "Idempotency-Key": str(key or uuid4())}
        )

    def together(fn):
        with ThreadPoolExecutor(max_workers=2) as pool:
            return list(pool.map(fn, range(2)))

    def worker(service, module, environment=env):
        completed = subprocess.run(
            [sys.executable, "-m", module, "--once"],
            cwd=BACKEND / "services" / service,
            env=environment,
            capture_output=True,
            text=True,
            timeout=45,
        )
        assert completed.returncode == 0, completed.stderr

    draft = {
        "items": [
            {
                "drug_name": "Clinical journey medicine",
                "strength": "10mg",
                "form": "tablet",
                "dose": "1 tablet",
                "route": "Oral",
                "frequency": "Once daily",
                "duration": "10 days",
                "quantity": 10,
                "instructions": "QA directions",
            }
        ],
        "valid_until": (date.today() + timedelta(days=30)).isoformat(),
        "clinical_goal": "QA prescription journey",
    }
    assert post(path, draft).status_code == 403
    grant = result(
        client.post(
            root + "/consents",
            headers=patient,
            json={"doctor_user_id": doctor_identity["id"], "scope": "records_and_prescriptions"},
        ),
        201,
    )
    assert post(path, draft, old_doctor_token).status_code == 403
    key = uuid4()
    duplicates = together(lambda _: post(path, draft, key=key))
    rx = result(duplicates[0], 201)
    assert result(duplicates[1], 201) == rx
    assert result(client.get(path, headers=patient))["items"] == []
    assert client.get(path, headers=other).status_code == 403
    rx_path = path + "/" + rx["id"]
    key = uuid4()
    issued = together(
        lambda _: post(
            rx_path + "/issue", {"version": 1, "clinical_review_confirmed": True}, key=key
        )
    )
    rx = result(issued[0])
    assert result(issued[1]) == rx and rx["status"] == "issued"
    assert result(client.get(rx_path, headers=patient))["items"] == draft["items"]
    tracked_course = medication_journey(client, root, patient, other, doctor, rx, databases)
    assert (
        client.get(
            urls["api_gateway"] + "/internal/clinical-prescriptions", headers=patient
        ).status_code
        == 404
    )
    assert (
        client.post(urls["pharmacy"] + "/internal/clinical-prescriptions", json={}).status_code
        == 401
    )

    pms = urls["pms"] + "/v1"
    drug = result(
        post(
            pms + "/drugs",
            {
                "name": draft["items"][0]["drug_name"],
                "category": "other",
                "form": "tablet",
                "strength": "10mg",
                "unit": "tablet",
            },
            staff,
        ),
        201,
    )
    batch = result(
        post(
            pms + "/batches",
            {
                "drug_id": drug["id"],
                "batch_number": "CLINICAL-QA",
                "quantity_received": 100,
                "unit_cost_cents": 10,
                "selling_price_cents": 100,
                "received_at": date.today().isoformat(),
                "expiry_date": (date.today() + timedelta(days=60)).isoformat(),
            },
            staff,
        ),
        201,
    )
    rx = result(post(rx_path + "/route", {"version": 2, "pharmacy_id": pharmacy_id}))
    worker(
        "ehr_service",
        "app.workers.prescriptions",
        {**env, "EHR_PHARMACY_SERVICE_URL": "http://127.0.0.1:1"},
    )
    failed = result(client.get(rx_path, headers=doctor))
    assert failed["deliveries"][0]["state"] == "queued" and failed["deliveries"][0]["attempts"] == 1
    with psycopg.connect(databases["ehr"]) as db:
        db.execute(
            "UPDATE prescription_deliveries SET next_attempt_at=now() WHERE prescription_id=%s",
            (rx["id"],),
        )
    together(lambda _: worker("ehr_service", "app.workers.prescriptions"))
    saved = result(client.get(rx_path, headers=patient))
    assert saved["deliveries"][0]["state"] == "delivered"
    with psycopg.connect(databases["pms"]) as db:
        rows = db.execute(
            "SELECT id FROM prescriptions WHERE external_ref=%s", (rx["id"],)
        ).fetchall()
        assert len(rows) == 1
        pms_id = str(rows[0][0])
    pms_path = pms + "/prescriptions/" + pms_id
    incoming = result(client.get(pms_path, headers=staff))
    assert incoming["valid_until"] == draft["valid_until"]
    result(
        post(
            pms_path + "/dispense",
            {
                "version": 1,
                "items": [{"prescription_item_id": incoming["items"][0]["id"], "quantity": 4}],
            },
            staff,
        )
    )
    assert (
        post(rx_path + "/correct", {"version": 3, "reason": "Review replacement"}).status_code
        == 409
    )
    cancelled = result(
        post(rx_path + "/cancel", {"version": 3, "reason": "Clinical review changed plan"})
    )
    assert cancelled["status"] == "cancelled"
    medication_url = root + "/medications/" + tracked_course
    tracked = result(client.get(medication_url, headers=patient))
    assert tracked["prescription_status"] == "cancelled" and tracked["status"] == "active"
    assert (
        post(
            medication_url + "/doses",
            {"version": 1, "outcome": "taken", "occurred_at": datetime.now(UTC).isoformat()},
            actor=patient,
        ).status_code
        == 409
    )
    assert len(result(client.get(medication_url + "/doses", headers=patient))["items"]) == 1
    assert (
        post(rx_path + "/correct", {"version": 4, "reason": "Review replacement"}).status_code
        == 409
    )
    worker("ehr_service", "app.workers.prescriptions")
    incoming = result(client.get(pms_path, headers=staff))
    assert incoming["status"] == "cancelled" and incoming["items"][0]["quantity_dispensed"] == 4
    replacement = result(post(rx_path + "/correct", {"version": 4, "reason": "Review replacement"}))
    assert replacement["replaces_id"] == rx["id"] and replacement["status"] == "draft"
    assert client.get(path + "/" + replacement["id"], headers=patient).status_code == 404
    worker(
        "pms_service",
        "app.workers.medapp_sync",
        {**env, "PMS_MEDAPP_SYNC_URL": urls["api_gateway"] + "/v1/pharmacy-sync/events"},
    )
    reports = result(
        client.get(urls["api_gateway"] + "/v1/me/pharmacy-prescriptions", headers=patient)
    )["items"]
    assert len(reports) == 1 and reports[0]["snapshot"]["status"] == "cancelled"
    assert reports[0]["snapshot"]["items"][0]["quantity_dispensed"] == 4
    assert (
        result(client.get(urls["api_gateway"] + "/v1/me/pharmacy-prescriptions", headers=other))[
            "items"
        ]
        == []
    )
    with psycopg.connect(databases["pms"]) as db:
        assert db.execute(
            "SELECT quantity_on_hand FROM drug_batches WHERE id=%s", (batch["id"],)
        ).fetchone() == (96,)
    result(client.delete(root + "/consents/" + grant["consent_id"], headers=patient))
    assert (
        post(
            path + "/" + replacement["id"] + "/issue",
            {"version": 1, "clinical_review_confirmed": True},
        ).status_code
        == 403
    )
    # A stale doctor JWT cannot prescribe after account deactivation.
    result(
        client.post(
            root + "/consents",
            headers=patient,
            json={"doctor_user_id": doctor_identity["id"], "scope": "records_and_prescriptions"},
        ),
        201,
    )
    with psycopg.connect(databases["user"]) as db:
        db.execute("UPDATE users SET is_active=false WHERE id=%s", (doctor_identity["id"],))
    assert post(
        path + "/" + replacement["id"] + "/issue", {"version": 1, "clinical_review_confirmed": True}
    ).status_code in {400, 401, 403}
