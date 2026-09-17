"""Patient tracking persists independently of prescribing and dispensing."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
import psycopg
from test_hospital_activation import result


def medication_journey(client, root, patient, other, doctor, rx, databases):
    path = root + "/medications"
    today = datetime.now(UTC).date()
    yesterday = (today - timedelta(days=1)).isoformat()

    def post(url, body, key=None, actor=patient):
        return client.post(
            url, headers={**actor, "Idempotency-Key": str(key or uuid4())}, json=body
        )

    def together(fn):
        with ThreadPoolExecutor(max_workers=2) as pool:
            return list(pool.map(fn, range(2)))

    payload = {
        "prescription_id": rx["id"],
        "prescription_item": 0,
        "start_date": today.isoformat(),
        "timezone": "Africa/Accra",
        "daily_times": [],
    }
    key = uuid4()
    created = together(lambda _: post(path, payload, key))
    prescribed = result(created[0], 201)
    assert result(created[1], 201) == prescribed
    assert prescribed["medicine"]["drug_name"] == rx["items"][0]["drug_name"]
    assert post(path, payload).status_code == 409
    assert post(path, payload, actor=other).status_code == 403
    # Explicit prescribing consent does not authorize modifying a patient's dose reports.
    assert client.get(path, headers=doctor).status_code == 403
    manual = result(
        post(
            path + "/" + prescribed["id"] + "/doses",
            {
                "version": 1,
                "outcome": "taken",
                "occurred_at": datetime.now(UTC).isoformat(),
            },
        ),
        201,
    )
    assert manual["scheduled_at"] is None and manual["time"] is None

    payload = {
        "medicine": {
            "drug_name": "QA self report",
            "strength": "10mg",
            "form": "tablet",
            "dose": "1 tablet",
            "route": "Oral",
            "frequency": "Once daily",
        },
        "start_date": yesterday,
        "timezone": "Africa/Accra",
        "daily_times": ["08:00", "20:00"],
    }
    own = result(post(path, payload), 201)
    url = path + "/" + own["id"]
    key = uuid4()
    command = {"version": 1, "day": yesterday, "time": "08:00", "outcome": "taken"}
    responses = together(lambda _: post(url + "/doses", command, key))
    dose = result(responses[0], 201)
    assert result(responses[1], 201) == dose
    # Different request keys still cannot report the same scheduled slot twice.
    responses = together(
        lambda _: post(url + "/doses", {**command, "time": "20:00", "outcome": "skipped"})
    )
    assert sorted(r.status_code for r in responses) == [201, 409]
    key = uuid4()
    correction = {"version": 1, "outcome": "voided", "reason": "Entered against the wrong day"}
    corrected = together(lambda _: post(url + "/doses/" + dose["id"] + "/correct", correction, key))
    assert result(corrected[0]) == result(corrected[1])
    assert result(corrected[0])["version"] == 2
    assert post(url + "/doses/" + dose["id"] + "/correct", correction).status_code == 409
    status = {"version": 1, "status": "paused", "reason": "Patient paused tracking"}
    responses = together(lambda _: post(url + "/status", status))
    assert sorted(r.status_code for r in responses) == [200, 409]
    result(
        post(
            url + "/status",
            {"version": 2, "status": "active", "reason": "Patient resumed tracking"},
        )
    )
    result(
        post(
            url + "/status",
            {"version": 3, "status": "completed", "reason": "Patient reports completion"},
        )
    )

    # A new client fetches committed data rather than process/client-local state.
    with httpx.Client(timeout=30, trust_env=False) as reopened:
        record = result(reopened.get(url, headers=patient))
        assert record["status"] == "completed" and record["version"] == 4
        entries = result(reopened.get(url + "/doses", headers=patient))["items"]
        assert {entry["outcome"] for entry in entries} == {"voided", "skipped"}
        assert reopened.get(url, headers=other).status_code == 403
        assert reopened.get(url + "/events", headers=other).status_code == 403
        tracking = result(
            reopened.get(path + "/tracker", headers=patient, params={"day": yesterday})
        )
        assert tracking["items"][0]["course"]["id"] == own["id"]
        assert {slot["state"] for slot in tracking["items"][0]["slots"]} == {"voided", "skipped"}
    with psycopg.connect(databases["ehr"]) as db:
        assert db.execute(
            "SELECT count(*) FROM medication_courses WHERE prescription_id=%s", (rx["id"],)
        ).fetchone() == (1,)
        assert db.execute(
            "SELECT count(*) FROM medication_doses WHERE course_id=%s", (own["id"],)
        ).fetchone() == (2,)
        assert db.execute(
            "SELECT count(*) FROM medication_events WHERE course_id=%s AND kind='dose_corrected'",
            (own["id"],),
        ).fetchone() == (1,)
    planned = result(post(path, payload), 201)
    plan_url = path + "/" + planned["id"]
    tomorrow = (today + timedelta(days=1)).isoformat()
    change = {
        "version": 1,
        "effective_date": tomorrow,
        "end_date": None,
        "daily_times": ["09:00"],
        "reason": "Adjust future tracking times",
    }
    key = uuid4()
    revisions = together(lambda _: post(plan_url + "/schedule", change, key))
    assert result(revisions[0]) == result(revisions[1])
    assert result(revisions[0])["daily_times"] == ["08:00", "20:00"]
    assert post(plan_url + "/schedule", change).status_code == 409
    assert post(plan_url + "/schedule", {**change, "version": 2}, actor=other).status_code == 403
    competing = together(
        lambda _: post(plan_url + "/schedule", {**change, "version": 2, "daily_times": ["10:00"]})
    )
    assert sorted(response.status_code for response in competing) == [200, 409]
    key = uuid4()
    enabled = together(
        lambda _: post(plan_url + "/reminders", {"version": 3, "enabled": True}, key)
    )
    assert result(enabled[0]) == result(enabled[1])
    with httpx.Client(timeout=30, trust_env=False) as reopened:
        fresh = result(reopened.get(plan_url, headers=patient))
        assert fresh["version"] == 4 and fresh["reminders_enabled"]
        assert fresh["schedule_changes"][0]["daily_times"] == ["10:00"]
        assert result(reopened.get(plan_url + "/reminder-history", headers=patient))["items"] == []
        assert reopened.get(plan_url + "/reminder-history", headers=other).status_code == 403
    return prescribed["id"]
