from __future__ import annotations

from uuid import UUID

import pytest

from app.models.lab import LabOrder


@pytest.mark.asyncio
async def test_doctor_can_create_order_and_patient_can_upload_result(doctor_client, patient_client, principal_patient, sessionmaker, result_time):
    order_resp = await doctor_client.post(
        "/v1/lab/orders",
        json={
            "patient_id": principal_patient.subject,
            "test_name": "Complete Blood Count",
            "priority": "routine",
            "instructions": "Fasting preferred",
        },
    )
    assert order_resp.status_code == 201, order_resp.text
    order_id = order_resp.json()["order_id"]

    upload_resp = await patient_client.post(
        "/v1/lab/results/upload",
        json={
            "lab_order_id": order_id,
            "title": "CBC result",
            "source": "patient_upload",
            "summary": "Normal range",
            "file_name": "cbc.pdf",
            "mime_type": "application/pdf",
            "storage_key": "lab-results/cbc.pdf",
            "resulted_at": result_time.isoformat(),
            "raw_text": "hemoglobin 13.5",
            "parsed_values": {"hemoglobin": "13.5 g/dL"},
        },
    )
    assert upload_resp.status_code == 201, upload_resp.text
    result_id = upload_resp.json()["result_id"]

    list_resp = await patient_client.get("/v1/me/lab/results")
    assert list_resp.status_code == 200, list_resp.text
    items = list_resp.json()["items"]
    assert len(items) == 1
    assert items[0]["result_id"] == result_id

    summary_resp = await patient_client.get("/v1/me/lab/summary")
    assert summary_resp.status_code == 200, summary_resp.text
    summary = summary_resp.json()
    assert summary["total_orders"] == 1
    assert summary["open_orders"] == 1
    assert summary["total_results"] == 1
    assert len(summary["recent_results"]) == 1
    assert summary["recent_results"][0]["result_id"] == result_id

    search_resp = await patient_client.get("/v1/me/lab/search", params={"q": "hemoglobin 13.5"})
    assert search_resp.status_code == 200, search_resp.text
    search = search_resp.json()
    assert search["query"] == "hemoglobin 13.5"
    assert len(search["items"]) == 1
    assert search["items"][0]["result"]["result_id"] == result_id


@pytest.mark.asyncio
async def test_other_patient_cannot_access_result(doctor_client, patient_client, other_patient_client, principal_patient, sessionmaker, result_time):
    order_resp = await doctor_client.post(
        "/v1/lab/orders",
        json={"patient_id": principal_patient.subject, "test_name": "Lipid Panel"},
    )
    order_id = order_resp.json()["order_id"]

    upload_resp = await patient_client.post(
        "/v1/lab/results/upload",
        json={
            "lab_order_id": order_id,
            "title": "Lipid panel",
            "resulted_at": result_time.isoformat(),
            "parsed_values": {"ldl": "90 mg/dL"},
        },
    )
    result_id = upload_resp.json()["result_id"]

    forbidden = await other_patient_client.get(f"/v1/lab/results/{result_id}")
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_patient_cannot_upload_for_another_patient(patient_client, principal_other_patient):
    response = await patient_client.post(
        "/v1/lab/results/upload",
        json={
            "patient_id": principal_other_patient.subject,
            "title": "Unauthorized upload",
            "source": "patient_upload",
        },
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_create_order_persists_doctor_context(doctor_client, principal_patient, sessionmaker):
    response = await doctor_client.post(
        "/v1/lab/orders",
        json={"patient_id": principal_patient.subject, "test_name": "Urinalysis"},
    )
    assert response.status_code == 201, response.text
    order = response.json()
    assert order["patient_id"] == principal_patient.subject
    assert order["status"] == "ordered"
    assert order["test_name"] == "Urinalysis"