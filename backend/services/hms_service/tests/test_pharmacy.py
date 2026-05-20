from __future__ import annotations

from uuid import uuid4

import pytest


DRUG_PAYLOAD = {
    "name": "Amoxicillin",
    "brand_name": "Amoxil",
    "category": "antibiotic",
    "form": "capsule",
    "strength": "500mg",
    "unit": "capsule",
    "reorder_level": 100,
}


async def _create_drug(client) -> str:
    resp = await client.post("/v1/pharmacy/drugs", json=DRUG_PAYLOAD)
    return resp.json()["drug_id"]


async def _create_patient(client) -> str:
    resp = await client.post("/v1/patients", json={
        "first_name": "Esi", "last_name": "Mensah",
    })
    return resp.json()["patient_id"]


@pytest.mark.asyncio
async def test_create_drug(client):
    resp = await client.post("/v1/pharmacy/drugs", json=DRUG_PAYLOAD)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Amoxicillin"
    assert data["category"] == "antibiotic"
    assert data["reorder_level"] == 100


@pytest.mark.asyncio
async def test_list_drugs(client):
    await client.post("/v1/pharmacy/drugs", json=DRUG_PAYLOAD)
    await client.post("/v1/pharmacy/drugs", json={
        **DRUG_PAYLOAD, "name": "Paracetamol", "brand_name": "Tylenol", "category": "analgesic",
    })

    resp = await client.get("/v1/pharmacy/drugs")
    assert resp.status_code == 200
    assert len(resp.json()["items"]) == 2


@pytest.mark.asyncio
async def test_list_drugs_by_category(client):
    await client.post("/v1/pharmacy/drugs", json=DRUG_PAYLOAD)
    await client.post("/v1/pharmacy/drugs", json={
        **DRUG_PAYLOAD, "name": "Paracetamol", "brand_name": "Tylenol", "category": "analgesic",
    })

    resp = await client.get("/v1/pharmacy/drugs", params={"category": "antibiotic"})
    assert resp.status_code == 200
    assert len(resp.json()["items"]) == 1


@pytest.mark.asyncio
async def test_update_drug(client):
    drug_id = await _create_drug(client)

    resp = await client.patch(f"/v1/pharmacy/drugs/{drug_id}", json={"reorder_level": 200})
    assert resp.status_code == 200
    assert resp.json()["reorder_level"] == 200


@pytest.mark.asyncio
async def test_add_batch(client):
    drug_id = await _create_drug(client)

    resp = await client.post(f"/v1/pharmacy/drugs/{drug_id}/batches", json={
        "batch_number": "BATCH-001",
        "quantity_received": 500,
        "unit_cost_cents": 150,
        "selling_price_cents": 300,
        "currency": "GHS",
        "supplier": "PharmaCo",
        "expiry_date": "2027-12-31",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["batch_number"] == "BATCH-001"
    assert data["quantity_received"] == 500
    assert data["quantity_remaining"] == 500


@pytest.mark.asyncio
async def test_stock_alerts_empty(client):
    resp = await client.get("/v1/pharmacy/stock-alerts")
    assert resp.status_code == 200
    assert resp.json()["items"] == []


@pytest.mark.asyncio
async def test_list_prescriptions_empty(client):
    resp = await client.get("/v1/prescriptions")
    assert resp.status_code == 200
    assert resp.json()["items"] == []
