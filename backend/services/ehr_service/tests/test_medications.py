from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from app.models.medication import MedicationCourse, MedicationDose, MedicationEvent
from app.models.prescription import ClinicalPrescription
from app.services import medications as service
from sqlalchemy import func, select
from test_prescriptions import issued, post
from test_prescriptions import prescribing as prescribing

pytestmark = pytest.mark.asyncio
NOW = datetime(2026, 9, 16, 12, tzinfo=UTC)


def body(**changes):
    return {
        "medicine": {
            "drug_name": "Patient entered medicine",
            "strength": "10mg",
            "form": "tablet",
            "dose": "1 tablet",
            "route": "Oral",
            "frequency": "Once daily",
        },
        "start_date": "2026-09-01",
        "end_date": None,
        "timezone": "Africa/Accra",
        "daily_times": ["08:00", "20:00"],
        **changes,
    }


@pytest.fixture(autouse=True)
def clock(monkeypatch):
    monkeypatch.setattr(service, "now", lambda: NOW)


async def make(patient_client, principal_patient, **changes):
    path = f"/v1/patients/{principal_patient.subject}/medications"
    response = await post(patient_client, path, body(**changes))
    assert response.status_code == 201, response.text
    return path, response.json(), path + "/" + response.json()["id"]


async def test_saved_self_report_replay_history_and_owner_only(
    patient_client, principal_patient, doctor_client, admin_client, sessionmaker
):
    path = f"/v1/patients/{principal_patient.subject}/medications"
    key = uuid4()
    first = await post(patient_client, path, body(), key)
    assert first.status_code == 201, first.text
    assert (await post(patient_client, path, body(), key)).json() == first.json()
    course = first.json()
    assert course["source"] == "self_reported" and course["prescription_id"] is None
    assert (await patient_client.get(path)).json()["items"] == [course]
    assert (await patient_client.get(path + "/" + course["id"])).headers[
        "cache-control"
    ] == "no-store"
    for outsider in (doctor_client, admin_client):
        for suffix in (
            "",
            "/" + course["id"],
            "/" + course["id"] + "/events",
            "/tracker?day=2026-09-16",
        ):
            assert (await outsider.get(path + suffix)).status_code == 403
        assert (await post(outsider, path, body(), key)).status_code == 403
    assert (await post(patient_client, path, body(daily_times=[]), key)).status_code == 409
    async with sessionmaker() as db:
        assert await db.scalar(select(func.count(MedicationCourse.id))) == 1
        assert await db.scalar(select(func.count(MedicationEvent.id))) == 1


@pytest.mark.parametrize(
    "change",
    [
        {"medicine": None},
        {"source": "prescribed"},
        {"patient_id": str(uuid4())},
        {"daily_times": ["25:00"]},
        {"daily_times": ["08:00", "08:00"]},
        {"daily_times": [f"{hour:02d}:00" for hour in range(13)]},
        {"timezone": "Unknown/City"},
        {"end_date": "2026-08-31"},
        {"start_date": "2035-01-01"},
        {"prescription_item": 0},
        {"prescription_id": str(uuid4())},
    ],
)
async def test_invalid_or_privileged_course_fields(patient_client, principal_patient, change):
    path = f"/v1/patients/{principal_patient.subject}/medications"
    assert (await post(patient_client, path, body(**change))).status_code == 422


async def test_prescribed_course_copies_only_authoritative_item_and_rejects_duplicates(
    prescribing, monkeypatch
):
    monkeypatch.setattr(service, "now", lambda: datetime.now(UTC))
    doctor, patient, rx_path, rx = await issued(prescribing)
    path = rx_path.replace("prescriptions", "medications")
    payload = body(
        medicine=None,
        prescription_id=rx["id"],
        prescription_item=0,
        start_date=datetime.now(UTC).date().isoformat(),
    )
    created = await post(patient, path, payload)
    assert created.status_code == 201, created.text
    record = created.json()
    assert record["medicine"]["drug_name"] == rx["items"][0]["drug_name"]
    assert record["source"] == "prescribed" and record["prescriber_name"] == rx["prescriber_name"]
    assert (await post(patient, path, payload)).status_code == 409
    assert (
        await post(patient, path, {**payload, "medicine": body()["medicine"]})
    ).status_code == 422
    assert (await post(patient, path, {**payload, "prescription_item": 19})).status_code == 422
    assert (
        await post(patient, path, {**payload, "prescription_id": str(uuid4())})
    ).status_code == 404
    await post(doctor, rx_path + "/" + rx["id"] + "/cancel", {"version": 2, "reason": "Withdrawn"})
    detail = (await patient.get(path + "/" + record["id"])).json()
    assert detail["prescription_status"] == "cancelled" and detail["status"] == "active"
    assert (await post(patient, path, payload)).status_code == 404
    assert (
        await post(
            patient,
            path + "/" + record["id"] + "/status",
            {"version": 1, "status": "paused", "reason": "Discuss with doctor"},
        )
    ).status_code == 200
    assert (
        await post(
            patient,
            path + "/" + record["id"] + "/status",
            {"version": 2, "status": "active", "reason": "Resume tracking"},
        )
    ).status_code == 409


async def test_dose_replay_duplicate_slot_correction_and_audit(
    patient_client, principal_patient, sessionmaker
):
    path, _, url = await make(patient_client, principal_patient)
    payload = {"version": 1, "day": "2026-09-16", "time": "08:00", "outcome": "taken"}
    key = uuid4()
    first = await post(patient_client, url + "/doses", payload, key)
    assert first.status_code == 201, first.text
    assert (await post(patient_client, url + "/doses", payload, key)).json() == first.json()
    assert (await post(patient_client, url + "/doses", payload)).status_code == 409
    dose = first.json()
    assert dose["scheduled_at"] == "2026-09-16T08:00:00Z" and dose["occurred_at"] is None
    correction = {"version": 1, "outcome": "skipped", "reason": "Entered incorrectly"}
    changed = await post(patient_client, url + "/doses/" + dose["id"] + "/correct", correction)
    assert changed.status_code == 200 and changed.json()["version"] == 2
    assert (
        await post(patient_client, url + "/doses/" + dose["id"] + "/correct", correction)
    ).status_code == 409
    tracker = (await patient_client.get(path + "/tracker?day=2026-09-16")).json()
    assert [slot["state"] for slot in tracker["items"][0]["slots"]] == ["skipped", "upcoming"]
    assert (await patient_client.get(url + "/doses")).json()["items"][0]["outcome"] == "skipped"
    events = (await patient_client.get(url + "/events")).json()["items"]
    assert any(
        e["kind"] == "dose_corrected" and e["payload"]["before"]["outcome"] == "taken"
        for e in events
    )
    async with sessionmaker() as db:
        assert await db.scalar(select(func.count(MedicationDose.id))) == 1


@pytest.mark.parametrize(
    "change,code",
    [
        ({"time": "20:00"}, 422),
        ({"time": "09:00"}, 422),
        ({"day": "2026-08-01"}, 409),
        ({"day": "2026-09-17"}, 422),
        ({"version": 9}, 409),
        ({"outcome": "missed"}, 422),
        ({"occurred_at": "2026-09-16T08:00:00Z"}, 422),
    ],
)
async def test_reject_invalid_future_or_stale_dose(patient_client, principal_patient, change, code):
    _, _, url = await make(patient_client, principal_patient)
    payload = {"version": 1, "day": "2026-09-16", "time": "08:00", "outcome": "taken", **change}
    assert (await post(patient_client, url + "/doses", payload)).status_code == code


async def test_pause_resume_preserves_past_slots_and_completion_is_explicit(
    patient_client, principal_patient, monkeypatch
):
    path, _, url = await make(
        patient_client, principal_patient, daily_times=["08:00", "14:00", "20:00"]
    )
    paused = await post(
        patient_client,
        url + "/status",
        {"version": 1, "status": "paused", "reason": "Patient paused"},
    )
    assert paused.json()["version"] == 2
    monkeypatch.setattr(service, "now", lambda: NOW + timedelta(hours=5))
    assert (
        await post(
            patient_client,
            url + "/status",
            {"version": 2, "status": "active", "reason": "Patient resumed"},
        )
    ).status_code == 200
    tracker = (await patient_client.get(path + "/tracker?day=2026-09-16")).json()
    assert [s["state"] for s in tracker["items"][0]["slots"]] == [
        "due",
        "not_scheduled",
        "upcoming",
    ]
    assert (
        await post(
            patient_client,
            url + "/doses",
            {"version": 3, "day": "2026-09-16", "time": "14:00", "outcome": "taken"},
        )
    ).status_code == 409
    assert (
        await post(
            patient_client,
            url + "/status",
            {"version": 3, "status": "completed", "reason": "Patient reports completion"},
        )
    ).status_code == 200
    assert (
        await post(
            patient_client,
            url + "/status",
            {"version": 4, "status": "active", "reason": "Correct completion report"},
        )
    ).status_code == 200


async def test_manual_tracking_and_removed_entry_history(patient_client, principal_patient):
    path, _, url = await make(patient_client, principal_patient, daily_times=[])
    payload = {"version": 1, "outcome": "taken", "occurred_at": "2026-09-16T11:00:00Z"}
    dose = (await post(patient_client, url + "/doses", payload)).json()
    assert dose["time"] is None and dose["scheduled_at"] is None
    assert (await post(patient_client, url + "/doses", payload)).status_code == 409
    assert (
        await post(
            patient_client,
            url + "/doses/" + dose["id"] + "/correct",
            {"version": 1, "outcome": "voided", "reason": "Not a dose"},
        )
    ).status_code == 200
    tracker = (await patient_client.get(path + "/tracker?day=2026-09-16")).json()
    assert tracker["items"][0]["slots"] == []
    assert tracker["items"][0]["manual_entries"][0]["outcome"] == "voided"


async def test_dst_gap_and_repeated_hour_are_not_duplicate_doses(
    patient_client, principal_patient, monkeypatch
):
    monkeypatch.setattr(service, "now", lambda: datetime(2026, 11, 2, tzinfo=UTC))
    path, _, url = await make(
        patient_client,
        principal_patient,
        start_date="2026-01-01",
        timezone="America/New_York",
        daily_times=["01:30", "02:30"],
    )
    spring = (await patient_client.get(path + "/tracker?day=2026-03-08")).json()["items"][0][
        "slots"
    ]
    assert spring[1]["state"] == "not_scheduled" and spring[1]["scheduled_at"] is None
    fall = (await patient_client.get(path + "/tracker?day=2026-11-01")).json()["items"][0]["slots"]
    assert fall[0]["scheduled_at"] == "2026-11-01T05:30:00Z"
    payload = {"version": 1, "day": "2026-11-01", "time": "01:30", "outcome": "taken"}
    assert (await post(patient_client, url + "/doses", payload)).status_code == 201
    assert (await post(patient_client, url + "/doses", payload)).status_code == 409


async def test_paging_bounds_and_planned_end_do_not_claim_completion(
    patient_client, principal_patient
):
    path, _, _ = await make(patient_client, principal_patient, end_date="2026-09-02")
    await make(patient_client, principal_patient)
    first = (await patient_client.get(path + "?limit=1")).json()
    second = (await patient_client.get(path + "?limit=1&offset=1")).json()
    assert first["next_offset"] == 1 and second["next_offset"] is None
    assert first["items"][0]["id"] != second["items"][0]["id"]
    assert second["items"][0]["status"] == "active"
    assert (await patient_client.get(path + "?limit=51")).status_code == 422
    tracker = (await patient_client.get(path + "/tracker?day=2026-09-16")).json()
    ended = next(row for row in tracker["items"] if row["course"]["end_date"])
    assert all(s["state"] == "not_scheduled" for s in ended["slots"])


async def test_replacement_preserves_original_withdrawal_cutoff(
    prescribing, sessionmaker, monkeypatch
):
    doctor, patient, rx_path, rx = await issued(prescribing)
    path = rx_path.replace("prescriptions", "medications")
    current = datetime.now(UTC)
    monkeypatch.setattr(service, "now", lambda: current + timedelta(minutes=10))
    tracked = await post(
        patient,
        path,
        body(
            medicine=None,
            prescription_id=rx["id"],
            prescription_item=0,
            start_date=current.date().isoformat(),
            daily_times=[],
        ),
    )
    assert tracked.status_code == 201, tracked.text
    url = rx_path + "/" + rx["id"]
    result = await post(doctor, url + "/cancel", {"version": 2, "reason": "Withdraw original"})
    assert result.status_code == 200
    cutoff = current - timedelta(minutes=2)
    async with sessionmaker() as db:
        original = await db.get(ClinicalPrescription, UUID(rx["id"]))
        original.issued_at = current - timedelta(minutes=5)
        original.cancelled_at = cutoff
        await db.commit()
    assert (
        await post(doctor, url + "/correct", {"version": 3, "reason": "Prepare replacement"})
    ).status_code == 200
    original = (await patient.get(url)).json()
    assert datetime.fromisoformat(original["cancelled_at"]).replace(tzinfo=UTC) == cutoff
    response = await post(
        patient,
        path + "/" + tracked.json()["id"] + "/doses",
        {
            "version": 1,
            "outcome": "taken",
            "occurred_at": (current - timedelta(minutes=1)).isoformat(),
        },
    )
    assert response.status_code == 409
