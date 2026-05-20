from __future__ import annotations

from uuid import uuid4

import pytest


DEPARTMENT_PAYLOAD = {
    "name": "General Medicine",
    "slug": "general-medicine",
    "description": "General medical care department",
}


def _staff_payload(department_id: str | None = None) -> dict:
    payload = {
        "user_id": str(uuid4()),
        "employee_id": "EMP-001",
        "first_name": "Dr. Kofi",
        "last_name": "Asante",
        "title": "Dr.",
        "specialty": "Internal Medicine",
        "qualification": "MB ChB",
        "phone": "+233201234567",
        "email": "kofi.asante@hospital.gh",
    }
    if department_id:
        payload["department_id"] = department_id
    return payload


@pytest.mark.asyncio
async def test_create_department(client):
    resp = await client.post("/v1/departments", json=DEPARTMENT_PAYLOAD)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "General Medicine"
    assert data["slug"] == "general-medicine"
    assert data["is_active"] is True


@pytest.mark.asyncio
async def test_list_departments(client):
    await client.post("/v1/departments", json=DEPARTMENT_PAYLOAD)
    await client.post("/v1/departments", json={**DEPARTMENT_PAYLOAD, "name": "Pediatrics", "slug": "pediatrics"})

    resp = await client.get("/v1/departments")
    assert resp.status_code == 200
    assert len(resp.json()["items"]) == 2


@pytest.mark.asyncio
async def test_update_department(client):
    create_resp = await client.post("/v1/departments", json=DEPARTMENT_PAYLOAD)
    dept_id = create_resp.json()["department_id"]

    resp = await client.patch(f"/v1/departments/{dept_id}", json={"description": "Updated description"})
    assert resp.status_code == 200
    assert resp.json()["description"] == "Updated description"


@pytest.mark.asyncio
async def test_create_staff(client):
    resp = await client.post("/v1/staff", json=_staff_payload())
    assert resp.status_code == 201
    data = resp.json()
    assert data["first_name"] == "Dr. Kofi"
    assert data["last_name"] == "Asante"
    assert data["specialty"] == "Internal Medicine"
    assert data["is_active"] is True


@pytest.mark.asyncio
async def test_create_staff_with_department(client):
    dept_resp = await client.post("/v1/departments", json=DEPARTMENT_PAYLOAD)
    dept_id = dept_resp.json()["department_id"]

    resp = await client.post("/v1/staff", json=_staff_payload(dept_id))
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_list_staff(client):
    await client.post("/v1/staff", json=_staff_payload())
    payload2 = _staff_payload()
    payload2["first_name"] = "Nurse Ama"
    payload2["last_name"] = "Boateng"
    payload2["employee_id"] = "EMP-002"
    await client.post("/v1/staff", json=payload2)

    resp = await client.get("/v1/staff")
    assert resp.status_code == 200
    assert len(resp.json()["items"]) == 2


@pytest.mark.asyncio
async def test_get_staff(client):
    create_resp = await client.post("/v1/staff", json=_staff_payload())
    staff_id = create_resp.json()["staff_id"]

    resp = await client.get(f"/v1/staff/{staff_id}")
    assert resp.status_code == 200
    assert resp.json()["staff_id"] == staff_id


@pytest.mark.asyncio
async def test_get_staff_not_found(client):
    resp = await client.get(f"/v1/staff/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_staff(client):
    create_resp = await client.post("/v1/staff", json=_staff_payload())
    staff_id = create_resp.json()["staff_id"]

    resp = await client.patch(f"/v1/staff/{staff_id}", json={"specialty": "Cardiology"})
    assert resp.status_code == 200
    assert resp.json()["specialty"] == "Cardiology"
