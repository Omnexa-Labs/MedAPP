from __future__ import annotations

from uuid import uuid4

import pytest


async def _create_patient(client) -> str:
    resp = await client.post("/v1/patients", json={
        "first_name": "Abena", "last_name": "Osei",
    })
    return resp.json()["patient_id"]


@pytest.mark.asyncio
async def test_create_invoice(client):
    patient_id = await _create_patient(client)

    resp = await client.post("/v1/invoices", json={
        "patient_id": patient_id,
        "currency": "GHS",
        "due_at": "2026-06-30",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["invoice_number"].startswith("INV-")
    assert data["status"] == "draft"
    assert data["total_amount_cents"] == 0
    assert data["paid_amount_cents"] == 0
    assert data["currency"] == "GHS"


@pytest.mark.asyncio
async def test_list_invoices(client):
    patient_id = await _create_patient(client)
    await client.post("/v1/invoices", json={"patient_id": patient_id, "currency": "GHS"})
    await client.post("/v1/invoices", json={"patient_id": patient_id, "currency": "GHS"})

    resp = await client.get("/v1/invoices")
    assert resp.status_code == 200
    assert len(resp.json()["items"]) == 2


@pytest.mark.asyncio
async def test_get_invoice(client):
    patient_id = await _create_patient(client)
    create_resp = await client.post("/v1/invoices", json={
        "patient_id": patient_id, "currency": "GHS",
    })
    invoice_id = create_resp.json()["invoice_id"]

    resp = await client.get(f"/v1/invoices/{invoice_id}")
    assert resp.status_code == 200
    assert resp.json()["invoice_id"] == invoice_id


@pytest.mark.asyncio
async def test_get_invoice_not_found(client):
    resp = await client.get(f"/v1/invoices/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_add_line_item(client):
    patient_id = await _create_patient(client)
    create_resp = await client.post("/v1/invoices", json={
        "patient_id": patient_id, "currency": "GHS",
    })
    invoice_id = create_resp.json()["invoice_id"]

    resp = await client.post(f"/v1/invoices/{invoice_id}/items", json={
        "description": "Consultation Fee",
        "category": "consultation",
        "quantity": 1,
        "unit_price_cents": 5000,
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["description"] == "Consultation Fee"
    assert data["total_cents"] == 5000


@pytest.mark.asyncio
async def test_record_payment(client):
    patient_id = await _create_patient(client)
    create_resp = await client.post("/v1/invoices", json={
        "patient_id": patient_id, "currency": "GHS",
    })
    invoice_id = create_resp.json()["invoice_id"]

    await client.post(f"/v1/invoices/{invoice_id}/items", json={
        "description": "Lab Test", "category": "lab_test", "quantity": 1, "unit_price_cents": 10000,
    })

    resp = await client.post(f"/v1/invoices/{invoice_id}/payments", json={
        "amount_cents": 10000,
        "currency": "GHS",
        "method": "mobile_money",
        "reference": "MM-TXN-12345",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["amount_cents"] == 10000
    assert data["method"] == "mobile_money"


@pytest.mark.asyncio
async def test_billing_summary(client):
    resp = await client.get("/v1/billing/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_revenue_cents" in data
    assert "total_outstanding_cents" in data
