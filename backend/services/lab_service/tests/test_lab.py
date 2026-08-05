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

@pytest.mark.asyncio
async def test_ordering_doctor_can_read_the_result_they_ordered(
    doctor_client, patient_client, principal_patient, result_time
):
    """The legitimate clinician path, and the one a naive fix breaks.

    An earlier version of this check reached for `result.order`, a relationship
    that does not exist on `LabResult` (it has only a nullable `lab_order_id`
    FK). That version 403'd the ordering doctor on every request — safe, but
    broken. This test is what distinguishes "locked down" from "bricked".
    """
    order_id = (
        await doctor_client.post(
            "/v1/lab/orders",
            json={"patient_id": principal_patient.subject, "test_name": "HbA1c"},
        )
    ).json()["order_id"]
    result_id = (
        await patient_client.post(
            "/v1/lab/results/upload",
            json={
                "lab_order_id": order_id,
                "title": "HbA1c",
                "resulted_at": result_time.isoformat(),
                "parsed_values": {"hba1c": "5.4 %"},
            },
        )
    ).json()["result_id"]

    allowed = await doctor_client.get(f"/v1/lab/results/{result_id}")
    assert allowed.status_code == 200
    assert allowed.json()["result_id"] == result_id


@pytest.mark.asyncio
async def test_unrelated_doctor_cannot_read_another_patients_result(
    doctor_client, patient_client, other_doctor_client, principal_patient, result_time
):
    """THE REGRESSION TEST. This was the vulnerability, not a hypothetical.

    `_can_access_result` used to return early on `role == "doctor"` with no
    ordering relationship, no consent and no care team — so any account holding
    the doctor role could read every patient's `raw_text`, `parsed_values`,
    `summary` and `external_url`. It chained with public signup accepting a
    client-supplied role, making it reachable without any account at all.
    """
    order_id = (
        await doctor_client.post(
            "/v1/lab/orders",
            json={"patient_id": principal_patient.subject, "test_name": "CBC"},
        )
    ).json()["order_id"]
    result_id = (
        await patient_client.post(
            "/v1/lab/results/upload",
            json={
                "lab_order_id": order_id,
                "title": "CBC",
                "resulted_at": result_time.isoformat(),
                "parsed_values": {"wbc": "6.1"},
            },
        )
    ).json()["result_id"]

    forbidden = await other_doctor_client.get(f"/v1/lab/results/{result_id}")
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_result_with_no_order_denies_every_clinician(
    doctor_client, patient_client, principal_patient, result_time
):
    """No relationship recorded means no clinician can claim one.

    `lab_order_id` is nullable, so a result can exist with no order behind it.
    Absence of a relationship must read as DENY, never as "unrestricted" — the
    failure mode that turns a missing foreign key into an open door.
    """
    result_id = (
        await patient_client.post(
            "/v1/lab/results/upload",
            json={
                # `patient_id` and NO `lab_order_id`. LabResultUpload requires one
                # or the other (schemas/lab.py:48), so this is how an order-less
                # result legitimately comes to exist: a patient uploading their
                # own outside result, with no clinician behind it.
                "patient_id": principal_patient.subject,
                "title": "Self-uploaded scan",
                "resulted_at": result_time.isoformat(),
                "parsed_values": {"note": "external"},
            },
        )
    ).json()["result_id"]

    forbidden = await doctor_client.get(f"/v1/lab/results/{result_id}")
    assert forbidden.status_code == 403
