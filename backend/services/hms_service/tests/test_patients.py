from __future__ import annotations

from uuid import uuid4

import pytest


PATIENT_PAYLOAD = {
    "first_name": "Kwame",
    "last_name": "Mensah",
    "date_of_birth": "1990-05-15",
    "gender": "male",
    "blood_group": "O+",
    "phone_primary": "+233241234567",
    "email": "kwame@example.com",
    "address": "12 Cantonments Rd",
    "city": "Accra",
    "region": "Greater Accra",
    "allergies": ["penicillin"],
    "chronic_conditions": ["hypertension"],
}


@pytest.mark.asyncio
async def test_register_patient(client):
    resp = await client.post("/v1/patients", json=PATIENT_PAYLOAD)
    assert resp.status_code == 201
    data = resp.json()
    assert data["first_name"] == "Kwame"
    assert data["last_name"] == "Mensah"
    assert data["mrn"].startswith("MRN-")
    assert data["gender"] == "male"
    assert data["blood_group"] == "O+"
    assert data["is_active"] is True
    assert "patient_id" in data


@pytest.mark.asyncio
async def test_list_patients_empty(client):
    resp = await client.get("/v1/patients")
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_list_patients_with_search(client):
    await client.post("/v1/patients", json=PATIENT_PAYLOAD)
    await client.post("/v1/patients", json={**PATIENT_PAYLOAD, "first_name": "Ama", "last_name": "Owusu"})

    resp = await client.get("/v1/patients", params={"search": "Kwame"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["first_name"] == "Kwame"


@pytest.mark.asyncio
async def test_get_patient(client):
    create_resp = await client.post("/v1/patients", json=PATIENT_PAYLOAD)
    patient_id = create_resp.json()["patient_id"]

    resp = await client.get(f"/v1/patients/{patient_id}")
    assert resp.status_code == 200
    assert resp.json()["patient_id"] == patient_id


@pytest.mark.asyncio
async def test_get_patient_not_found(client):
    resp = await client.get(f"/v1/patients/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_patient(client):
    create_resp = await client.post("/v1/patients", json=PATIENT_PAYLOAD)
    patient_id = create_resp.json()["patient_id"]

    resp = await client.patch(f"/v1/patients/{patient_id}", json={"city": "Kumasi"})
    assert resp.status_code == 200
    assert resp.json()["city"] == "Kumasi"
    assert resp.json()["first_name"] == "Kwame"


@pytest.mark.asyncio
async def test_create_visit(client):
    create_resp = await client.post("/v1/patients", json=PATIENT_PAYLOAD)
    patient_id = create_resp.json()["patient_id"]

    visit_payload = {"visit_type": "outpatient", "chief_complaint": "Headache"}
    resp = await client.post(f"/v1/patients/{patient_id}/visits", json=visit_payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["visit_type"] == "outpatient"
    assert data["chief_complaint"] == "Headache"
    assert data["status"] == "registered"
    assert data["checked_in_at"] is not None


@pytest.mark.asyncio
async def test_list_visits(client):
    create_resp = await client.post("/v1/patients", json=PATIENT_PAYLOAD)
    patient_id = create_resp.json()["patient_id"]

    await client.post(f"/v1/patients/{patient_id}/visits", json={"visit_type": "outpatient"})
    await client.post(f"/v1/patients/{patient_id}/visits", json={"visit_type": "emergency"})

    resp = await client.get(f"/v1/patients/{patient_id}/visits")
    assert resp.status_code == 200
    assert len(resp.json()["items"]) == 2


@pytest.mark.asyncio
async def test_update_visit_discharge(client):
    create_resp = await client.post("/v1/patients", json=PATIENT_PAYLOAD)
    patient_id = create_resp.json()["patient_id"]

    visit_resp = await client.post(f"/v1/patients/{patient_id}/visits", json={"visit_type": "outpatient"})
    visit_id = visit_resp.json()["visit_id"]

    resp = await client.patch(
        f"/v1/visits/{visit_id}",
        json={"status": "discharged", "diagnosis": "Migraine"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "discharged"
    assert data["diagnosis"] == "Migraine"
    assert data["checked_out_at"] is not None
