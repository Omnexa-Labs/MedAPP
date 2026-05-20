from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_dashboard_summary(client):
    resp = await client.get("/v1/dashboard/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_patients" in data
    assert "patients_registered_today" in data
    assert "appointments_today" in data
    assert "queue_waiting" in data
    assert "queue_serving" in data
    assert "revenue_today_cents" in data
    assert "revenue_this_month_cents" in data
    assert "currency" in data


@pytest.mark.asyncio
async def test_dashboard_summary_with_data(client):
    await client.post("/v1/patients", json={
        "first_name": "Test", "last_name": "Patient",
    })

    resp = await client.get("/v1/dashboard/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_patients"] >= 1
    assert data["patients_registered_today"] >= 1
