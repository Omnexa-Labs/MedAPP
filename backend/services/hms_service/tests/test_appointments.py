from __future__ import annotations

from uuid import uuid4

import pytest


async def _create_patient(client) -> str:
    resp = await client.post("/v1/patients", json={
        "first_name": "Ama", "last_name": "Darko",
    })
    return resp.json()["patient_id"]


async def _create_staff(client) -> str:
    resp = await client.post("/v1/staff", json={
        "user_id": str(uuid4()),
        "first_name": "Dr. Yaw",
        "last_name": "Boateng",
        "title": "Dr.",
        "specialty": "Pediatrics",
    })
    return resp.json()["staff_id"]


@pytest.mark.asyncio
async def test_book_appointment(client):
    patient_id = await _create_patient(client)
    doctor_id = await _create_staff(client)

    resp = await client.post("/v1/appointments", json={
        "patient_id": patient_id,
        "doctor_staff_id": doctor_id,
        "appointment_type": "scheduled",
        "scheduled_date": "2026-06-01",
        "scheduled_start": "09:00",
        "scheduled_end": "09:30",
        "reason": "Annual checkup",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "scheduled"
    assert data["appointment_type"] == "scheduled"
    assert data["reason"] == "Annual checkup"


@pytest.mark.asyncio
async def test_list_appointments(client):
    patient_id = await _create_patient(client)
    doctor_id = await _create_staff(client)

    await client.post("/v1/appointments", json={
        "patient_id": patient_id, "doctor_staff_id": doctor_id,
        "scheduled_date": "2026-06-01", "scheduled_start": "09:00", "scheduled_end": "09:30",
    })
    await client.post("/v1/appointments", json={
        "patient_id": patient_id, "doctor_staff_id": doctor_id,
        "scheduled_date": "2026-06-02", "scheduled_start": "10:00", "scheduled_end": "10:30",
    })

    resp = await client.get("/v1/appointments")
    assert resp.status_code == 200
    assert len(resp.json()["items"]) == 2


@pytest.mark.asyncio
async def test_update_appointment_status(client):
    patient_id = await _create_patient(client)
    doctor_id = await _create_staff(client)

    create_resp = await client.post("/v1/appointments", json={
        "patient_id": patient_id, "doctor_staff_id": doctor_id,
        "scheduled_date": "2026-06-01", "scheduled_start": "09:00", "scheduled_end": "09:30",
    })
    appt_id = create_resp.json()["appointment_id"]

    resp = await client.patch(f"/v1/appointments/{appt_id}", json={"status": "confirmed"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "confirmed"


@pytest.mark.asyncio
async def test_cancel_appointment(client):
    patient_id = await _create_patient(client)
    doctor_id = await _create_staff(client)

    create_resp = await client.post("/v1/appointments", json={
        "patient_id": patient_id, "doctor_staff_id": doctor_id,
        "scheduled_date": "2026-06-01", "scheduled_start": "09:00", "scheduled_end": "09:30",
    })
    appt_id = create_resp.json()["appointment_id"]

    resp = await client.patch(f"/v1/appointments/{appt_id}", json={
        "status": "cancelled", "cancellation_reason": "Patient requested",
    })
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"
    assert resp.json()["cancellation_reason"] == "Patient requested"


@pytest.mark.asyncio
async def test_add_to_queue(client):
    patient_id = await _create_patient(client)

    resp = await client.post("/v1/queue", json={
        "patient_id": patient_id,
        "queue_type": "walk_in",
        "priority": 2,
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "waiting"
    assert data["ticket_number"] is not None
    assert data["priority"] == 2


@pytest.mark.asyncio
async def test_list_queue(client):
    p1 = await _create_patient(client)
    p2 = await _create_patient(client)

    await client.post("/v1/queue", json={"patient_id": p1})
    await client.post("/v1/queue", json={"patient_id": p2})

    resp = await client.get("/v1/queue")
    assert resp.status_code == 200
    assert len(resp.json()["items"]) == 2


@pytest.mark.asyncio
async def test_queue_stats(client):
    resp = await client.get("/v1/queue/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_waiting" in data
    assert "total_serving" in data
    assert "avg_wait_minutes" in data
