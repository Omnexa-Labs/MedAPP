from datetime import timedelta
from uuid import uuid4
import httpx
import pytest

from app.services import availability
from shared.auth import Principal
from sqlalchemy import select
from app.models import AccessAudit


def payload(window, doctor, hours=0):
    return {"doctor_id": doctor, "starts_at": (window[0] + timedelta(hours=hours)).isoformat(),
            "ends_at": (window[1] + timedelta(hours=hours)).isoformat(), "reason": "Follow-up"}


async def test_slots_remove_taken_windows_without_patient_data(client, booking_window, linked_doctor):
    day = booking_window[0].date().isoformat()
    params = {"doctor_id": linked_doctor, "from_date": day, "to_date": day}
    before = await client.get("/v1/bookings/slots", params=params)
    assert before.status_code == 200
    assert before.headers["cache-control"] == "no-store"
    created = await client.post("/v1/bookings", json=payload(booking_window, linked_doctor))
    assert created.status_code == 201
    after = (await client.get("/v1/bookings/slots", params=params)).json()["items"]
    assert len(after) == len(before.json()["items"]) - 1
    assert set(after[0]) == {"doctor_id", "starts_at", "ends_at", "timezone"}


async def test_unoffered_clock_cannot_be_booked(client, booking_window, linked_doctor):
    shifted = tuple(t + timedelta(minutes=7) for t in booking_window)
    response = await client.post("/v1/bookings", json=payload(shifted, linked_doctor))
    assert response.status_code == 409
    assert (await client.get("/v1/bookings")).json()["items"] == []


async def test_reschedule_persists_replacement_and_retries_same_result(client, booking_window, linked_doctor):
    old = (await client.post("/v1/bookings", json=payload(booking_window, linked_doctor))).json()
    target = payload(booking_window, linked_doctor, 2)
    route = f"/v1/bookings/{old['booking_id']}/reschedule"
    moved = await client.post(route, json=target)
    assert moved.status_code == 200, moved.text
    again = await client.post(route, json=target)
    assert again.json()["booking_id"] == moved.json()["booking_id"]
    items = (await client.get("/v1/bookings")).json()["items"]
    assert len(items) == 2
    assert [i["status"] for i in items] == ["cancelled", "booked"]
    changed = await client.post(route, json=payload(booking_window, linked_doctor, 3))
    assert changed.status_code == 409
    naive = {**target, "starts_at": target["starts_at"].replace("+00:00", "")}
    assert (await client.post(route, json=naive)).status_code == 400


async def test_failed_reschedule_keeps_original(client, booking_window, linked_doctor):
    old = (await client.post("/v1/bookings", json=payload(booking_window, linked_doctor))).json()
    target = payload(booking_window, linked_doctor, 2)
    assert (await client.post("/v1/bookings", json=target)).status_code == 201
    result = await client.post(f"/v1/bookings/{old['booking_id']}/reschedule", json=target)
    assert result.status_code == 409
    assert (await client.get(f"/v1/bookings/{old['booking_id']}")).json()["status"] == "booked"


async def test_unavailable_directory_rolls_back_reschedule(client, booking_window, linked_doctor, monkeypatch):
    old = (await client.post("/v1/bookings", json=payload(booking_window, linked_doctor))).json()
    monkeypatch.setattr(availability, "_build_client", lambda: httpx.AsyncClient(
        base_url="http://doctor.test", transport=httpx.MockTransport(lambda _: httpx.Response(503))))
    result = await client.post(f"/v1/bookings/{old['booking_id']}/reschedule", json=payload(booking_window, linked_doctor, 2))
    assert result.status_code == 503
    assert (await client.get(f"/v1/bookings/{old['booking_id']}")).json()["status"] == "booked"


@pytest.mark.parametrize("role", ["user", "doctor"])
async def test_other_patient_or_clinician_cannot_reschedule(client_as, principal, linked_doctor, booking_window, role):
    async with client_as(principal) as client:
        old = (await client.post("/v1/bookings", json=payload(booking_window, linked_doctor))).json()
    async with client_as(Principal(subject=str(uuid4()), role=role)) as other:
        result = await other.post(f"/v1/bookings/{old['booking_id']}/reschedule", json=payload(booking_window, linked_doctor, 2))
        assert result.status_code == 403


async def test_provider_schedule_reads_replacement(client_as, principal, doctor_principal, linked_doctor, booking_window):
    async with client_as(principal) as client:
        old = (await client.post("/v1/bookings", json=payload(booking_window, linked_doctor))).json()
        moved = (await client.post(f"/v1/bookings/{old['booking_id']}/reschedule", json=payload(booking_window, linked_doctor, 2))).json()
    async with client_as(doctor_principal) as doctor:
        items = (await doctor.get("/v1/bookings/schedule", params={"status": "booked"})).json()["items"]
        assert len(items) == 1
        assert items[0]["booking_id"] == moved["booking_id"]
        assert items[0]["starts_at"] == moved["starts_at"]


async def test_slots_reject_naive_upstream_and_excessive_range(client, booking_window, linked_doctor, monkeypatch):
    day = booking_window[0].date()
    params = {"doctor_id": linked_doctor, "from_date": day.isoformat(), "to_date": (day + timedelta(days=31)).isoformat()}
    assert (await client.get("/v1/bookings/slots", params=params)).status_code == 400
    monkeypatch.setattr(availability, "_build_client", lambda: httpx.AsyncClient(base_url="http://doctor.test",
        transport=httpx.MockTransport(lambda _: httpx.Response(200, json={"items": [{"doctor_id": linked_doctor,
            "starts_at": "2030-01-01T10:00:00", "ends_at": "2030-01-01T10:30:00", "timezone": "UTC"}]}))))
    params["to_date"] = day.isoformat()
    assert (await client.get("/v1/bookings/slots", params=params)).status_code == 503


@pytest.mark.parametrize("action", ["cancel", "reschedule"])
@pytest.mark.parametrize("allowed", [True, False])
async def test_locked_booking_writes_preserve_access_audit(
    client_as, principal, linked_doctor, booking_window, session_factory, action, allowed
):
    async with client_as(principal) as client:
        old = (await client.post("/v1/bookings", json=payload(booking_window, linked_doctor))).json()
    caller = principal if allowed else Principal(subject=str(uuid4()), role="user")
    body = {} if action == "cancel" else payload(booking_window, linked_doctor, 2)
    async with client_as(caller) as client:
        result = await client.post(f"/v1/bookings/{old['booking_id']}/{action}", json=body)
        assert result.status_code == (200 if allowed else 403)
    async with session_factory() as db:
        rows = list((await db.scalars(select(AccessAudit).where(AccessAudit.resource == "booking_write"))).all())
        assert len(rows) == 1
        assert str(rows[0].patient_id) == principal.subject
        assert str(rows[0].accessor_user_id) == caller.subject
        assert rows[0].outcome == ("granted" if allowed else "denied")
