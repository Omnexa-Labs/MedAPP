from __future__ import annotations

from uuid import UUID

import pytest

from app.models.hospital import HospitalProfile, HospitalReview


@pytest.mark.asyncio
async def test_admin_can_create_and_list_hospitals(admin_client, hospital_sample):
    create_resp = await admin_client.post("/v1/hospitals", json=hospital_sample)
    assert create_resp.status_code == 201, create_resp.text
    hospital_id = create_resp.json()["hospital_id"]

    list_resp = await admin_client.get("/v1/hospitals", params={"specialty": "cardio", "city": "Kampala"})
    assert list_resp.status_code == 200, list_resp.text
    items = list_resp.json()["items"]
    assert len(items) == 1
    assert items[0]["hospital_id"] == hospital_id


@pytest.mark.asyncio
async def test_patient_can_read_hospital_details(patient_client, admin_client, hospital_sample):
    create_resp = await admin_client.post("/v1/hospitals", json=hospital_sample)
    hospital_id = create_resp.json()["hospital_id"]

    read_resp = await patient_client.get(f"/v1/hospitals/{hospital_id}")
    assert read_resp.status_code == 200, read_resp.text
    assert read_resp.json()["slug"] == hospital_sample["slug"]


@pytest.mark.asyncio
async def test_admin_can_add_staff_member(admin_client, hospital_sample, principal_doctor):
    create_resp = await admin_client.post("/v1/hospitals", json=hospital_sample)
    hospital_id = create_resp.json()["hospital_id"]

    staff_resp = await admin_client.post(
        f"/v1/hospitals/{hospital_id}/staff",
        json={"user_id": principal_doctor.subject, "role": "doctor", "title": "Consultant", "department": "Cardiology"},
    )
    assert staff_resp.status_code == 201, staff_resp.text
    assert staff_resp.json()["user_id"] == principal_doctor.subject
    assert staff_resp.json()["role"] == "doctor"


@pytest.mark.asyncio
async def test_non_admin_cannot_create_hospital(patient_client, hospital_sample):
    create_resp = await patient_client.post("/v1/hospitals", json=hospital_sample)
    assert create_resp.status_code == 403


@pytest.mark.asyncio
async def test_reviews_endpoint_returns_public_reviews(admin_client, patient_client, hospital_sample, review_time, sessionmaker):
    create_resp = await admin_client.post("/v1/hospitals", json=hospital_sample)
    hospital_id = create_resp.json()["hospital_id"]

    async with sessionmaker() as session:
        hospital = await session.get(HospitalProfile, UUID(hospital_id))
        review = HospitalReview(
            hospital_id=hospital.id,
            reviewer_user_id=UUID("55555555-5555-5555-5555-555555555555"),
            rating=5,
            title="Excellent care",
            body="Fast and professional service.",
            is_public=True,
            moderation_status="approved",
            created_at=review_time,
            updated_at=review_time,
        )
        session.add(review)
        await session.commit()

    reviews_resp = await patient_client.get(f"/v1/hospitals/{hospital_id}/reviews")
    assert reviews_resp.status_code == 200, reviews_resp.text
    items = reviews_resp.json()
    assert len(items) == 1
    assert items[0]["title"] == "Excellent care"