from __future__ import annotations

from uuid import UUID

import pytest


@pytest.mark.asyncio
async def test_hospital_team_application_can_submit_and_be_reviewed(hospital_client, admin_client, hospital_team_payload):
    create_resp = await hospital_client.post("/v1/onboarding/applications", json=hospital_team_payload)
    assert create_resp.status_code == 201, create_resp.text
    application_id = create_resp.json()["application_id"]

    submit_resp = await hospital_client.post(f"/v1/onboarding/applications/{application_id}/submit")
    assert submit_resp.status_code == 200, submit_resp.text
    assert submit_resp.json()["status"] == "submitted"

    review_start = await admin_client.post(
        f"/v1/onboarding/applications/{application_id}/review",
        json={"action": "under_review"},
    )
    assert review_start.status_code == 200, review_start.text
    assert review_start.json()["status"] == "under_review"

    approve_resp = await admin_client.post(
        f"/v1/onboarding/applications/{application_id}/review",
        json={"action": "approve"},
    )
    assert approve_resp.status_code == 200, approve_resp.text
    assert approve_resp.json()["status"] == "approved"
    assert len(approve_resp.json()["team_members"]) == 1


@pytest.mark.asyncio
async def test_practitioner_submission_requires_documents(doctor_client, practitioner_payload):
    create_resp = await doctor_client.post("/v1/onboarding/applications", json=practitioner_payload)
    assert create_resp.status_code == 201, create_resp.text
    application_id = create_resp.json()["application_id"]

    submit_resp = await doctor_client.post(f"/v1/onboarding/applications/{application_id}/submit")
    assert submit_resp.status_code == 400

    doc_resp = await doctor_client.post(
        f"/v1/onboarding/applications/{application_id}/documents",
        json={"kind": "medical_license", "url": "https://files.example.com/license.pdf"},
    )
    assert doc_resp.status_code == 200, doc_resp.text

    submit_resp = await doctor_client.post(f"/v1/onboarding/applications/{application_id}/submit")
    assert submit_resp.status_code == 200, submit_resp.text
    assert submit_resp.json()["status"] == "submitted"


@pytest.mark.asyncio
async def test_pharmacy_application_is_owned_by_submitter(pharmacist_client, admin_client, pharmacy_payload):
    create_resp = await pharmacist_client.post("/v1/onboarding/applications", json=pharmacy_payload)
    assert create_resp.status_code == 201, create_resp.text
    application_id = create_resp.json()["application_id"]

    read_resp = await pharmacist_client.get(f"/v1/onboarding/applications/{application_id}")
    assert read_resp.status_code == 200, read_resp.text
    assert read_resp.json()["partner_type"] == "pharmacy"

    list_resp = await admin_client.get("/v1/onboarding/applications")
    assert list_resp.status_code == 200, list_resp.text
    assert len(list_resp.json()["items"]) == 1


@pytest.mark.asyncio
async def test_non_owner_cannot_read_application(pharmacist_client, doctor_client, pharmacy_payload):
    create_resp = await pharmacist_client.post("/v1/onboarding/applications", json=pharmacy_payload)
    application_id = create_resp.json()["application_id"]

    read_resp = await doctor_client.get(f"/v1/onboarding/applications/{application_id}")
    assert read_resp.status_code == 403


@pytest.mark.asyncio
async def test_rejection_requires_reason(admin_client, hospital_client, hospital_team_payload):
    create_resp = await hospital_client.post("/v1/onboarding/applications", json=hospital_team_payload)
    application_id = create_resp.json()["application_id"]
    submit_resp = await hospital_client.post(f"/v1/onboarding/applications/{application_id}/submit")
    assert submit_resp.status_code == 200, submit_resp.text

    reject_resp = await admin_client.post(
        f"/v1/onboarding/applications/{application_id}/review",
        json={"action": "reject"},
    )
    assert reject_resp.status_code == 400