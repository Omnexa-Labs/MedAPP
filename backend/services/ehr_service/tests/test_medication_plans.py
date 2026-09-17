from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
import pytest
from app.config import settings
from app.models.medication import MedicationReminderAttempt, MedicationReminderDevice
from app.services import medications as service
from app.workers import medication_reminders as worker
from sqlalchemy import func, select
from test_medications import NOW, make
from test_prescriptions import post

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def clock(monkeypatch):
    monkeypatch.setattr(service, "now", lambda: NOW)
    monkeypatch.setattr(settings, "medication_push_enabled", True)


def revision(**changes):
    return {
        "version": 1,
        "effective_date": "2026-09-17",
        "end_date": "2026-09-25",
        "daily_times": ["09:00"],
        "reason": "Patient updated tracking plan",
        **changes,
    }


async def test_revision_keeps_past_doses_and_uses_plan_for_reporting(
    patient_client, principal_patient, monkeypatch
):
    path, _, url = await make(patient_client, principal_patient)
    saved = await post(
        patient_client,
        url + "/doses",
        {"version": 1, "day": "2026-09-16", "time": "08:00", "outcome": "taken"},
    )
    key = uuid4()
    changed = await post(patient_client, url + "/schedule", revision(), key)
    assert changed.status_code == 200, changed.text
    assert changed.json()["daily_times"] == ["08:00", "20:00"]
    assert changed.json()["version"] == 2
    assert (await post(patient_client, url + "/schedule", revision(), key)).json() == changed.json()
    yesterday = (await patient_client.get(path + "/tracker?day=2026-09-16")).json()["items"][0]
    assert yesterday["slots"][0]["dose"] == saved.json()
    tomorrow = (await patient_client.get(path + "/tracker?day=2026-09-17")).json()["items"][0]
    assert [s["time"] for s in tomorrow["slots"]] == ["09:00"]
    monkeypatch.setattr(service, "now", lambda: NOW + timedelta(days=1))
    assert (await patient_client.get(url)).json()["daily_times"] == ["09:00"]
    assert (
        await post(
            patient_client,
            url + "/doses",
            {"version": 2, "day": "2026-09-16", "time": "20:00", "outcome": "taken"},
        )
    ).status_code == 201
    assert (
        await post(
            patient_client,
            url + "/doses",
            {"version": 2, "day": "2026-09-17", "time": "08:00", "outcome": "taken"},
        )
    ).status_code == 422
    assert (
        await post(
            patient_client,
            url + "/doses",
            {"version": 2, "day": "2026-09-17", "time": "09:00", "outcome": "taken"},
        )
    ).status_code == 201


@pytest.mark.parametrize(
    "change",
    [
        {"effective_date": "2026-09-16"},
        {"effective_date": "2028-01-01"},
        {"daily_times": ["09:00", "09:00"]},
        {"daily_times": ["24:00"]},
        {"timezone": "UTC"},
        {"medicine": {}},
        {"start_date": "2026-09-15"},
        {"end_date": "2026-09-16"},
        {"end_date": "2040-01-01"},
        {"reason": ""},
    ],
)
async def test_invalid_revision(patient_client, principal_patient, change):
    _, _, url = await make(patient_client, principal_patient)
    assert (await post(patient_client, url + "/schedule", revision(**change))).status_code == 422


async def test_pending_revision_replacement_retains_audit_and_is_versioned(
    patient_client, principal_patient, doctor_client
):
    _, _, url = await make(patient_client, principal_patient)
    assert (await post(doctor_client, url + "/schedule", revision())).status_code == 403
    assert (await post(patient_client, url + "/schedule", revision())).status_code == 200
    assert (await post(patient_client, url + "/schedule", revision())).status_code == 409
    changed = (
        await post(
            patient_client,
            url + "/schedule",
            revision(version=2, effective_date="2026-09-18", daily_times=[]),
        )
    ).json()
    assert (
        len(changed["schedule_changes"]) == 1
        and changed["schedule_changes"][0]["daily_times"] == []
    )
    events = (await patient_client.get(url + "/events")).json()["items"]
    assert sum(e["kind"] == "schedule_changed" for e in events) == 2
    assert any(e["payload"].get("before") == [revision_to_plan()] for e in events)


def revision_to_plan():
    return {
        k: v for k, v in revision().items() if k in {"effective_date", "end_date", "daily_times"}
    }


async def test_manual_revision_does_not_change_old_schedule(
    patient_client, principal_patient, monkeypatch
):
    path, _, url = await make(patient_client, principal_patient, daily_times=[])
    await post(patient_client, url + "/schedule", revision())
    monkeypatch.setattr(service, "now", lambda: NOW + timedelta(days=1))
    result = await post(
        patient_client,
        url + "/doses",
        {"version": 2, "occurred_at": NOW.isoformat(), "outcome": "taken"},
    )
    assert result.status_code == 201, result.text
    row = (await patient_client.get(path + "/tracker?day=2026-09-16")).json()["items"][0]
    assert row["slots"] == [] and row["manual_entries"][0] == result.json()
    assert (
        await post(
            patient_client,
            url + "/doses",
            {
                "version": 2,
                "occurred_at": (NOW + timedelta(days=1)).isoformat(),
                "outcome": "taken",
            },
        )
    ).status_code == 422


async def test_future_boundary_uses_saved_timezone(patient_client, principal_patient):
    _, _, url = await make(patient_client, principal_patient, timezone="Pacific/Kiritimati")
    # UTC is Sep 16 noon; UTC+14 is already Sep 17.
    assert (await post(patient_client, url + "/schedule", revision())).status_code == 422
    assert (
        await post(patient_client, url + "/schedule", revision(effective_date="2026-09-18"))
    ).status_code == 200


async def prepare_reminder(patient_client, principal_patient, monkeypatch):
    path, course, url = await make(patient_client, principal_patient, daily_times=["12:01"])
    binding = uuid4()
    response = await patient_client.post(
        path + "/reminder-devices",
        json={"push_token": "ExpoPushToken[qa_token]", "binding_id": str(binding)},
    )
    assert response.status_code == 200, response.text
    preference = await post(patient_client, url + "/reminders", {"version": 1, "enabled": True})
    assert preference.status_code == 200, preference.text
    monkeypatch.setattr(service, "now", lambda: NOW + timedelta(minutes=1, seconds=1))
    return path, course, url, binding


async def test_reminder_one_attempt_no_sensitive_payload_or_false_delivered_state(
    patient_client, principal_patient, monkeypatch, sessionmaker
):
    _, _, url, _ = await prepare_reminder(patient_client, principal_patient, monkeypatch)
    sent = []

    async def send(token):
        sent.append(token)
        return "accepted", "ticket-id", None

    assert await worker.run_once(sessionmaker, send) == 1
    assert await worker.run_once(sessionmaker, send) == 0
    assert sent == ["ExpoPushToken[qa_token]"]
    history = (await patient_client.get(url + "/reminder-history")).json()
    assert history["items"][0]["state"] == "accepted"
    assert "ticket-id" not in str(history) and "qa_token" not in str(history)
    assert (await patient_client.get(url + "/doses")).json()["items"] == []


@pytest.mark.parametrize(
    "action",
    [
        "off",
        "paused",
        "completed",
        "stopped",
        "dose",
        "voided",
        "device",
        "expired",
        "late",
        "service_off",
    ],
)
async def test_reminders_suppressed_by_current_saved_state(
    patient_client, principal_patient, monkeypatch, sessionmaker, action
):
    path, _, url, binding = await prepare_reminder(patient_client, principal_patient, monkeypatch)
    if action == "off":
        await post(patient_client, url + "/reminders", {"version": 2, "enabled": False})
    elif action in {"paused", "completed", "stopped"}:
        await post(
            patient_client,
            url + "/status",
            {"version": 2, "status": action, "reason": "Patient tracking change"},
        )
    elif action in {"dose", "voided"}:
        dose = (
            await post(
                patient_client,
                url + "/doses",
                {"version": 2, "day": "2026-09-16", "time": "12:01", "outcome": "taken"},
            )
        ).json()
        if action == "voided":
            await post(
                patient_client,
                url + "/doses/" + dose["id"] + "/correct",
                {"version": 1, "outcome": "voided", "reason": "Wrong entry"},
            )
    elif action == "device":
        await patient_client.post(path + f"/reminder-devices/{binding}/disable")
    elif action == "expired":
        async with sessionmaker() as db:
            device = await db.scalar(select(MedicationReminderDevice))
            device.expires_at = NOW
            await db.commit()
    elif action == "late":
        monkeypatch.setattr(service, "now", lambda: NOW + timedelta(minutes=7))
    else:
        monkeypatch.setattr(settings, "medication_push_enabled", False)

    async def send(_):
        pytest.fail("suppressed reminder contacted provider")

    assert await worker.run_once(sessionmaker, send) == 0


@pytest.mark.parametrize(
    "state,error",
    [("unconfirmed", "provider_response_unconfirmed"), ("rejected", "device_not_registered")],
)
async def test_uncertain_delivery_is_not_replayed(
    patient_client, principal_patient, monkeypatch, sessionmaker, state, error
):
    await prepare_reminder(patient_client, principal_patient, monkeypatch)

    async def send(_):
        return state, None, error

    assert await worker.run_once(sessionmaker, send) == 1
    assert await worker.run_once(sessionmaker, send) == 0
    async with sessionmaker() as db:
        assert await db.scalar(select(func.count(MedicationReminderAttempt.id))) == 1
        device = await db.scalar(select(MedicationReminderDevice))
        assert device.enabled == (state != "rejected")


async def test_new_plan_is_used_when_reminder_becomes_due(
    patient_client, principal_patient, monkeypatch, sessionmaker
):
    _, _, url, _ = await prepare_reminder(patient_client, principal_patient, monkeypatch)
    assert (
        await post(patient_client, url + "/schedule", revision(version=2, daily_times=["12:02"]))
    ).status_code == 200
    monkeypatch.setattr(service, "now", lambda: NOW + timedelta(days=1, minutes=1, seconds=1))
    calls = []

    async def send(token):
        calls.append(token)
        return "accepted", "new-plan-ticket", None

    assert await worker.run_once(sessionmaker, send) == 0
    monkeypatch.setattr(service, "now", lambda: NOW + timedelta(days=1, minutes=2, seconds=1))
    assert await worker.run_once(sessionmaker, send) == 1
    assert len(calls) == 1


async def test_device_owner_validation_configuration_and_binding_rotation(
    patient_client, principal_patient, doctor_client, monkeypatch, sessionmaker
):
    path, _, _ = await make(patient_client, principal_patient)
    url = path + "/reminder-devices"
    first, second = uuid4(), uuid4()
    payload = {"push_token": "ExpoPushToken[qa_token]", "binding_id": str(first)}
    assert (await doctor_client.post(url, json=payload)).status_code == 403
    assert (
        await patient_client.post(url, json={**payload, "push_token": "https://evil.invalid"})
    ).status_code == 422
    monkeypatch.setattr(settings, "medication_push_enabled", False)
    assert (await patient_client.post(url, json=payload)).status_code == 503
    monkeypatch.setattr(settings, "medication_push_enabled", True)
    assert (await patient_client.post(url, json=payload)).status_code == 200
    assert (
        await patient_client.post(url, json={**payload, "binding_id": str(second)})
    ).status_code == 200
    await patient_client.post(url + f"/{first}/disable")
    async with sessionmaker() as db:
        devices = list(await db.scalars(select(MedicationReminderDevice)))
        assert len(devices) == 1 and devices[0].enabled and devices[0].binding_id == second


@pytest.mark.parametrize(
    "response,expected",
    [
        ({"data": {"status": "ok", "id": "ticket"}}, ("accepted", "ticket", None)),
        (
            {"data": {"status": "error", "details": {"error": "DeviceNotRegistered"}}},
            ("rejected", None, "device_not_registered"),
        ),
        ({"data": {}}, ("unconfirmed", None, "provider_response_unconfirmed")),
    ],
)
async def test_expo_adapter_checks_acknowledgement_and_uses_generic_message(
    monkeypatch, response, expected
):
    requests = []

    def handle(request):
        requests.append(request)
        return httpx.Response(200, json=response)

    original = httpx.AsyncClient
    monkeypatch.setattr(
        worker.httpx,
        "AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs),
    )
    assert await worker.submit("ExpoPushToken[qa]") == expected
    assert requests[0].url == "https://exp.host/--/api/v2/push/send"
    import json

    payload = json.loads(requests[0].content)
    assert payload["data"] == {"kind": "medication_reminder"} and payload["ttl"] == 60
    assert "dose tracker" in payload["body"] and "medicine" not in payload["body"]


@pytest.mark.parametrize(
    "moment,expected",
    [
        (datetime(2026, 3, 8, 7, 2, tzinfo=UTC), 0),
        (datetime(2026, 11, 1, 5, 31, tzinfo=UTC), 1),
        (datetime(2026, 11, 1, 6, 31, tzinfo=UTC), 0),
    ],
)
async def test_reminder_dst_gap_and_fold(moment, expected):
    from app.models.medication import MedicationCourse

    course = MedicationCourse(
        id=uuid4(),
        status="active",
        reminders_enabled=True,
        reminders_since=datetime(2026, 1, 1, tzinfo=UTC),
        start_date=datetime(2026, 1, 1).date(),
        timezone="America/New_York",
        daily_times=["02:00"] if moment.month == 3 else ["01:30"],
        end_date=None,
        schedule_changes=[],
    )
    assert len(worker.due_slots(course, None, [], moment)) == expected
    from types import SimpleNamespace

    assert worker.due_slots(course, SimpleNamespace(status="cancelled"), [], moment) == []


async def test_resume_does_not_catch_up_reminders_from_before_pause(
    patient_client, principal_patient, monkeypatch, sessionmaker
):
    _, _, url, _ = await prepare_reminder(patient_client, principal_patient, monkeypatch)
    assert (
        await post(
            patient_client,
            url + "/status",
            {"version": 2, "status": "paused", "reason": "Paused after due time"},
        )
    ).status_code == 200
    monkeypatch.setattr(service, "now", lambda: NOW + timedelta(minutes=1, seconds=2))
    assert (
        await post(
            patient_client,
            url + "/status",
            {"version": 3, "status": "active", "reason": "Resume future reminders"},
        )
    ).status_code == 200

    async def sender(_):
        pytest.fail("Resuming must not send a reminder from before the pause")

    assert await worker.run_once(sessionmaker, sender) == 0
