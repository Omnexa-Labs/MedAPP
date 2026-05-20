from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from app.models.record import PatientRecord


@pytest.mark.asyncio
async def test_patient_bundle_requires_consent(patient_client, doctor_client, principal_patient, principal_doctor, sessionmaker):
    async with sessionmaker() as session:
        patient = PatientRecord(user_id=UUID(principal_patient.subject), display_name="Patient One")
        session.add(patient)
        await session.commit()
        await session.refresh(patient)

    forbidden = await doctor_client.get(f"/v1/patients/{principal_patient.subject}/records")
    assert forbidden.status_code == 403

    consent_resp = await patient_client.post(
        f"/v1/patients/{principal_patient.subject}/consents",
        json={"doctor_user_id": principal_doctor.subject, "scope": "records", "reason": "review charts"},
    )
    assert consent_resp.status_code == 201, consent_resp.text

    allowed = await doctor_client.get(f"/v1/patients/{principal_patient.subject}/records")
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["patient"]["user_id"] == principal_patient.subject


@pytest.mark.asyncio
async def test_patient_summary_returns_bounded_clinical_snapshot(patient_client, doctor_client, principal_patient, principal_doctor, sessionmaker):
    async with sessionmaker() as session:
        patient = PatientRecord(user_id=UUID(principal_patient.subject), display_name="Patient Summary")
        session.add(patient)
        await session.commit()
        await session.refresh(patient)

    await patient_client.post(
        f"/v1/patients/{principal_patient.subject}/consents",
        json={"doctor_user_id": principal_doctor.subject, "scope": "records", "reason": "summary review"},
    )

    for offset, value in enumerate(("36.9", "37.1", "37.4"), start=1):
        await doctor_client.post(
            f"/v1/patients/{principal_patient.subject}/vitals",
            json={
                "kind": "temperature",
                "value": value,
                "unit": "C",
                "recorded_at": (datetime.now(UTC) - timedelta(minutes=offset)).isoformat(),
                "note": f"sample-{offset}",
            },
        )

    summary = await doctor_client.get(f"/v1/patients/{principal_patient.subject}/summary")
    assert summary.status_code == 200, summary.text
    body = summary.json()
    assert body["patient"]["user_id"] == principal_patient.subject
    assert len(body["latest_vitals"]) == 3
    assert [item["value"] for item in body["latest_vitals"]] == ["37.4", "37.1", "36.9"]
    assert len(body["active_consents"]) == 1


@pytest.mark.asyncio
async def test_vitals_timeline_is_monotonic(patient_client, doctor_client, principal_patient, principal_doctor, sessionmaker):
    async with sessionmaker() as session:
        patient = PatientRecord(user_id=UUID(principal_patient.subject), display_name="Patient Two")
        session.add(patient)
        await session.commit()
        await session.refresh(patient)

    await patient_client.post(
        f"/v1/patients/{principal_patient.subject}/consents",
        json={"doctor_user_id": principal_doctor.subject, "scope": "records", "reason": "review"},
    )

    first = datetime.now(UTC) - timedelta(hours=1)
    second = datetime.now(UTC)

    await doctor_client.post(
        f"/v1/patients/{principal_patient.subject}/vitals",
        json={"kind": "temperature", "value": "37.0", "unit": "C", "recorded_at": first.isoformat(), "note": "first"},
    )
    await doctor_client.post(
        f"/v1/patients/{principal_patient.subject}/vitals",
        json={"kind": "temperature", "value": "37.2", "unit": "C", "recorded_at": second.isoformat(), "note": "second"},
    )

    vitals = await patient_client.get(f"/v1/patients/{principal_patient.subject}/vitals")
    assert vitals.status_code == 200, vitals.text
    items = vitals.json()["items"]
    assert [item["recorded_at"] for item in items] == sorted(item["recorded_at"] for item in items)


@pytest.mark.asyncio
async def test_consent_revocation_is_immediate(patient_client, doctor_client, principal_patient, principal_doctor, sessionmaker):
    async with sessionmaker() as session:
        patient = PatientRecord(user_id=UUID(principal_patient.subject), display_name="Patient Three")
        session.add(patient)
        await session.commit()
        await session.refresh(patient)

    created = await patient_client.post(
        f"/v1/patients/{principal_patient.subject}/consents",
        json={"doctor_user_id": principal_doctor.subject, "scope": "records", "reason": "chart review"},
    )
    consent_id = created.json()["consent_id"]

    allowed = await doctor_client.get(f"/v1/patients/{principal_patient.subject}/records")
    assert allowed.status_code == 200, allowed.text

    revoked = await patient_client.delete(f"/v1/patients/{principal_patient.subject}/consents/{consent_id}")
    assert revoked.status_code == 200, revoked.text

    forbidden = await doctor_client.get(f"/v1/patients/{principal_patient.subject}/records")
    assert forbidden.status_code == 403
