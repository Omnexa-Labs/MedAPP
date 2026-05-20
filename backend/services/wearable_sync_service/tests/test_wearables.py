from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
import pytest

from app.main import app


@pytest.mark.asyncio
async def test_register_and_list_devices(client):
    response = await client.post(
        "/v1/wearables/devices",
        json={"provider": "fitbit", "external_id": "fitbit-123", "display_name": "Fitbit Sense"},
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["provider"] == "fitbit"
    assert payload["external_id"] == "fitbit-123"


@pytest.mark.asyncio
async def test_sync_pushes_samples_to_ehr(client):
    calls: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return httpx.Response(201, json={"vital_id": str(uuid4())})

    app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://ehr")
    try:
        response = await client.post(
            "/v1/wearables/sync",
            json={
                "device": {"provider": "apple_health", "external_id": "watch-1", "display_name": "Apple Watch"},
                "samples": [
                    {
                        "kind": "heart_rate",
                        "value": "72",
                        "unit": "bpm",
                        "recorded_at": datetime.now(tz=UTC).isoformat(),
                        "source_payload": {"raw": 72},
                    },
                    {
                        "kind": "glucose",
                        "value": "5.2",
                        "unit": "mmol/L",
                        "recorded_at": (datetime.now(tz=UTC) + timedelta(minutes=5)).isoformat(),
                        "source_payload": {"raw": 5.2},
                    },
                ],
            },
        )
    finally:
            await app.state.http.aclose()

    assert response.status_code == 201
    payload = response.json()
    assert payload["synced_count"] == 2
    assert payload["failed_count"] == 0
    assert len(calls) == 2

    summary = await client.get("/v1/wearables/summary")
    assert summary.status_code == 200, summary.text
    body = summary.json()
    assert body["total_devices"] == 1
    assert body["active_devices"] == 1
    assert body["total_samples"] == 2
    assert body["synced_samples"] == 2
    assert body["failed_samples"] == 0
    assert len(body["recent_samples"]) == 2


@pytest.mark.asyncio
async def test_sync_surfaces_ehr_failures(client):
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="ehr unavailable")

    app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://ehr")
    try:
        response = await client.post(
            "/v1/wearables/sync",
            json={
                "device": {"provider": "garmin", "external_id": "garmin-77"},
                "samples": [
                    {
                        "kind": "blood_pressure",
                        "value": "120/80",
                        "unit": "mmHg",
                        "recorded_at": datetime.now(tz=UTC).isoformat(),
                    }
                ],
            },
        )
    finally:
            await app.state.http.aclose()

    assert response.status_code == 201
    payload = response.json()
    assert payload["synced_count"] == 0
    assert payload["failed_count"] == 1
    assert payload["samples"][0]["sync_status"] == "failed"