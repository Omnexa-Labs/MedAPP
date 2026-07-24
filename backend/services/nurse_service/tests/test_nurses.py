from __future__ import annotations

from uuid import UUID

import pytest

from app.models.nurse import NurseProfile, NurseServiceArea


@pytest.mark.asyncio
async def test_nurse_can_create_and_update_profile(nurse_client, nurse_payload):
    create_resp = await nurse_client.post("/v1/nurses", json=nurse_payload)
    assert create_resp.status_code == 201, create_resp.text
    nurse_id = create_resp.json()["nurse_id"]

    update_resp = await nurse_client.patch(
        f"/v1/nurses/{nurse_id}",
        json={"bio": "Updated bio", "languages": ["English"]},
    )
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["bio"] == "Updated bio"
    assert update_resp.json()["languages"] == ["English"]


@pytest.mark.asyncio
async def test_admin_can_manage_and_search_listable_nurses(admin_client, nurse_client, nurse_payload, service_area_payload, admin_location):
    create_resp = await nurse_client.post("/v1/nurses", json=nurse_payload)
    nurse_id = create_resp.json()["nurse_id"]

    area_resp = await nurse_client.post(f"/v1/nurses/{nurse_id}/service_area", json=service_area_payload)
    assert area_resp.status_code == 200, area_resp.text

    search_resp = await admin_client.get(
        "/v1/nurses",
        params={"within_km": 5, **admin_location},
    )
    assert search_resp.status_code == 200, search_resp.text
    items = search_resp.json()["items"]
    assert len(items) == 1
    assert items[0]["nurse_id"] == nurse_id


@pytest.mark.asyncio
async def test_other_nurse_cannot_modify_profile(nurse_client, other_nurse_client, nurse_payload):
    create_resp = await nurse_client.post("/v1/nurses", json=nurse_payload)
    nurse_id = create_resp.json()["nurse_id"]

    forbidden = await other_nurse_client.patch(f"/v1/nurses/{nurse_id}", json={"bio": "tamper"})
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_non_nurse_cannot_create_profile(patient_client, nurse_payload):
    response = await patient_client.post("/v1/nurses", json=nurse_payload)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_service_area_requires_radius_fields(nurse_client, nurse_payload):
    create_resp = await nurse_client.post("/v1/nurses", json=nurse_payload)
    nurse_id = create_resp.json()["nurse_id"]

    response = await nurse_client.post(
        f"/v1/nurses/{nurse_id}/service_area",
        json={"service_area_type": "radius", "center_latitude": 0.1, "radius_km": 10},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_nurse_directory_search_by_q(nurse_client, admin_client, nurse_payload):
    # Seed one nurse via the nurse principal, then list as admin.
    create_resp = await nurse_client.post("/v1/nurses", json=nurse_payload)
    assert create_resp.status_code == 201

    # Match by specialty: "community care" -> "community" hit.
    by_specialty = await admin_client.get("/v1/nurses", params={"q": "community"})
    assert by_specialty.status_code == 200
    assert len(by_specialty.json()["items"]) == 1

    # Match by last name.
    by_name = await admin_client.get("/v1/nurses", params={"q": "atieno"})
    assert by_name.status_code == 200
    assert len(by_name.json()["items"]) == 1
    assert by_name.json()["items"][0]["last_name"] == "Atieno"

    # No match.
    none = await admin_client.get("/v1/nurses", params={"q": "zzz-no-match"})
    assert none.status_code == 200
    assert none.json()["items"] == []