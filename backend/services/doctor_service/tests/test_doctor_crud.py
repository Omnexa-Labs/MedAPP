from __future__ import annotations

from fastapi import status


async def test_doctor_profile_crud_flow(client) -> None:
    create_payload = {
        "first_name": "Amina",
        "last_name": "Mensah",
        "specialty": "Cardiology",
        "bio": "Heart specialist",
        "languages": ["en", "tw"],
        "consultation_fee_cents": 15000,
        "photo_url": "https://example.com/amina.jpg",
        "is_listable": True,
    }

    create_resp = await client.post("/v1/doctors", json=create_payload)
    assert create_resp.status_code == status.HTTP_201_CREATED
    created = create_resp.json()
    doctor_id = created["doctor_id"]

    read_resp = await client.get(f"/v1/doctors/{doctor_id}")
    assert read_resp.status_code == status.HTTP_200_OK
    assert read_resp.json()["first_name"] == "Amina"

    update_resp = await client.patch(
        f"/v1/doctors/{doctor_id}",
        json={"bio": "Updated bio", "consultation_fee_cents": 17500},
    )
    assert update_resp.status_code == status.HTTP_200_OK
    updated = update_resp.json()
    assert updated["bio"] == "Updated bio"
    assert updated["consultation_fee_cents"] == 17500

    list_resp = await client.get("/v1/doctors", params={"specialty": "Cardio"})
    assert list_resp.status_code == status.HTTP_200_OK
    assert len(list_resp.json()["items"]) == 1

    delete_resp = await client.delete(f"/v1/doctors/{doctor_id}")
    assert delete_resp.status_code == status.HTTP_204_NO_CONTENT

    missing_resp = await client.get(f"/v1/doctors/{doctor_id}")
    assert missing_resp.status_code == status.HTTP_404_NOT_FOUND


async def test_ownership_and_admin_override(client, session_factory, principal, app=None) -> None:
    create_payload = {
        "first_name": "Kofi",
        "last_name": "Owusu",
        "specialty": "Dermatology",
        "is_listable": True,
    }
    create_resp = await client.post("/v1/doctors", json=create_payload)
    doctor_id = create_resp.json()["doctor_id"]

    from app.deps import get_current_principal
    from app.main import app as doctor_app
    from shared.auth import Principal as SharedPrincipal

    async def _user_override():
        return SharedPrincipal(subject=principal.subject, role="user")

    doctor_app.dependency_overrides[get_current_principal] = _user_override
    forbidden = await client.patch(f"/v1/doctors/{doctor_id}", json={"bio": "nope"})
    assert forbidden.status_code == status.HTTP_403_FORBIDDEN

    async def _admin_override():
        return SharedPrincipal(subject="22222222-2222-2222-2222-222222222222", role="admin")

    doctor_app.dependency_overrides[get_current_principal] = _admin_override
    admin_update = await client.patch(f"/v1/doctors/{doctor_id}", json={"bio": "allowed"})
    assert admin_update.status_code == status.HTTP_200_OK
    assert admin_update.json()["bio"] == "allowed"
    doctor_app.dependency_overrides.clear()


async def test_availability_and_slots(client) -> None:
    create_resp = await client.post(
        "/v1/doctors",
        json={"first_name": "Ama", "last_name": "Boateng", "is_listable": True},
    )
    doctor_id = create_resp.json()["doctor_id"]

    availability_resp = await client.put(
        f"/v1/doctors/{doctor_id}/availability",
        json={
            "items": [
                {"day_of_week": 0, "start_time": "09:00:00", "end_time": "11:00:00", "timezone": "UTC"},
                {"day_of_week": 2, "start_time": "14:00:00", "end_time": "16:00:00", "timezone": "UTC"},
            ]
        },
    )
    assert availability_resp.status_code == status.HTTP_200_OK
    assert len(availability_resp.json()["items"]) == 2

    slots_resp = await client.get(
        f"/v1/doctors/{doctor_id}/slots",
        params={"from_date": "2026-05-18", "to_date": "2026-05-20", "slot_minutes": 60},
    )
    assert slots_resp.status_code == status.HTTP_200_OK
    assert len(slots_resp.json()["items"]) == 4