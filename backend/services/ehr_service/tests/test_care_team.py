from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from app.models.record import AccessAudit, Consent, PatientRecord, VitalReading
from app.services import record_service
from shared.auth import Principal

pytestmark = pytest.mark.asyncio


async def grant(client, patient, doctor, **extra):
    return await client.post(f"/v1/patients/{patient}/consents", json={"doctor_user_id": doctor, **extra})


async def test_read_only_grant_never_permits_vital_writes(patient_client, doctor_client, principal_patient, principal_doctor, vitals_payload, sessionmaker):
    patient = principal_patient.subject
    path = f"/v1/patients/{patient}"
    assert (await doctor_client.post(path + "/vitals", json=vitals_payload)).status_code == 403
    response = await grant(patient_client, patient, principal_doctor.subject)
    assert response.status_code == 201, response.text
    consent = response.json()
    assert consent["scope"] == "records" and consent["status"] == "active"
    assert consent["clinician_display_name"] == "Test doctor" and consent["clinician_role"] == "doctor"
    assert datetime.fromisoformat(consent["expires_at"]) > datetime.now(UTC) + timedelta(days=29)
    for suffix in ("/records", "/summary", "/vitals"):
        assert (await doctor_client.get(path + suffix)).status_code == 200
    assert (await doctor_client.post(path + "/vitals", json=vitals_payload)).status_code == 403
    async with sessionmaker() as db:
        assert await db.scalar(select(VitalReading)) is None


async def test_write_permission_is_explicit_and_revocation_stops_reads_and_writes(patient_client, doctor_client, principal_patient, principal_doctor, vitals_payload):
    path = f"/v1/patients/{principal_patient.subject}"
    response = await grant(patient_client, principal_patient.subject, principal_doctor.subject,
                           scope="records_and_vitals", expires_in_days=7)
    assert response.status_code == 201, response.text
    assert (await doctor_client.post(path + "/vitals", json=vitals_payload)).status_code == 201
    deleted = await patient_client.delete(path + "/consents/" + response.json()["consent_id"])
    assert deleted.json()["status"] == "revoked"
    for suffix in ("/records", "/summary", "/vitals"):
        assert (await doctor_client.get(path + suffix)).status_code == 403
    assert (await doctor_client.post(path + "/vitals", json=vitals_payload)).status_code == 403


async def test_revoked_permission_can_be_granted_again_without_losing_history(patient_client, principal_patient, principal_doctor, sessionmaker):
    path = f"/v1/patients/{principal_patient.subject}/consents"
    first = (await grant(patient_client, principal_patient.subject, principal_doctor.subject)).json()
    deleted = (await patient_client.delete(path + "/" + first["consent_id"])).json()
    retry = (await patient_client.delete(path + "/" + first["consent_id"])).json()
    # SQLite drops timezone metadata on reload; the persisted instant is unchanged.
    assert datetime.fromisoformat(retry["revoked_at"]).replace(tzinfo=UTC) == datetime.fromisoformat(deleted["revoked_at"]).replace(tzinfo=UTC)
    second = await grant(patient_client, principal_patient.subject, principal_doctor.subject)
    assert second.status_code == 201 and second.json()["consent_id"] != first["consent_id"]
    history = (await patient_client.get(path, params={"include_inactive": "true"})).json()["items"]
    assert {item["status"] for item in history} == {"active", "revoked"}
    assert len((await patient_client.get(path)).json()["items"]) == 1
    async with sessionmaker() as db:
        revocations = list((await db.scalars(select(AccessAudit).where(AccessAudit.resource == "consent_revoke"))).all())
        assert len(revocations) == 1


async def test_expiry_stops_access_and_allows_a_new_grant(patient_client, doctor_client, principal_patient, principal_doctor, sessionmaker, vitals_payload):
    path = f"/v1/patients/{principal_patient.subject}"
    response = await grant(patient_client, principal_patient.subject, principal_doctor.subject, scope="records_and_vitals")
    first = response.json()
    async with sessionmaker() as db:
        consent = await db.get(Consent, UUID(first["consent_id"]))
        consent.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        await db.commit()
    assert (await doctor_client.get(path + "/summary")).status_code == 403
    assert (await doctor_client.post(path + "/vitals", json=vitals_payload)).status_code == 403
    assert (await patient_client.get(path + "/consents")).json()["items"] == []
    assert (await patient_client.get(path + "/consents", params={"include_inactive": "true"})).json()["items"][0]["status"] == "expired"
    second = await grant(patient_client, principal_patient.subject, principal_doctor.subject, scope="records_and_vitals")
    assert second.status_code == 201, second.text
    assert (await doctor_client.get(path + "/summary")).status_code == 200


async def test_patient_controls_are_private_and_validate_target_scope_and_duration(patient_client, doctor_client, principal_patient, principal_doctor):
    patient = principal_patient.subject
    path = f"/v1/patients/{patient}/consents"
    assert (await doctor_client.get(path)).status_code == 403
    assert (await grant(patient_client, str(uuid4()), principal_doctor.subject)).status_code == 403
    assert (await grant(patient_client, patient, patient)).status_code == 400
    assert (await grant(patient_client, patient, str(uuid4()))).status_code == 400
    assert (await grant(patient_client, patient, principal_doctor.subject, scope="all_records")).status_code == 422
    assert (await grant(patient_client, patient, principal_doctor.subject, expires_in_days=3650)).status_code == 422
    assert (await grant(patient_client, patient, principal_doctor.subject, clinician_display_name="Spoofed")).status_code == 422
    assert (await patient_client.get(path, params={"limit": 1000})).status_code == 422
    assert (await patient_client.delete(path + "/" + str(uuid4()))).status_code == 404


async def test_duplicate_grants_conflict_without_overriding_permissions(patient_client, principal_patient, principal_doctor):
    first = await grant(patient_client, principal_patient.subject, principal_doctor.subject)
    assert first.status_code == 201
    second = await grant(patient_client, principal_patient.subject, principal_doctor.subject, scope="records_and_vitals")
    assert second.status_code == 409
    items = (await patient_client.get(f"/v1/patients/{principal_patient.subject}/consents")).json()["items"]
    assert len(items) == 1 and items[0]["scope"] == "records"


async def test_paging_and_named_nurse_access_do_not_expose_other_care_team_members(patient_client, doctor_client, principal_patient, principal_doctor, principal_nurse, sessionmaker):
    patient = principal_patient.subject
    await grant(patient_client, patient, principal_doctor.subject)
    nurse = await grant(patient_client, patient, principal_nurse.subject)
    assert nurse.status_code == 201 and nurse.json()["clinician_role"] == "nurse"
    page = await patient_client.get(f"/v1/patients/{patient}/consents", params={"limit": 1})
    assert page.headers["cache-control"] == "no-store"
    assert page.json()["next_offset"] == 1
    next_page = (await patient_client.get(f"/v1/patients/{patient}/consents", params={"limit": 1, "offset": 1})).json()
    assert next_page["next_offset"] is None
    assert next_page["items"][0]["consent_id"] != page.json()["items"][0]["consent_id"]
    filtered = (await patient_client.get(f"/v1/patients/{patient}/consents", params={"clinician_user_id": principal_nurse.subject})).json()
    assert len(filtered["items"]) == 1 and filtered["items"][0]["doctor_user_id"] == principal_nurse.subject
    doctor = (await doctor_client.get(f"/v1/patients/{patient}/records")).json()
    assert len(doctor["consents"]) == 1 and doctor["consents"][0]["doctor_user_id"] == principal_doctor.subject
    async with sessionmaker() as db:
        summary = await record_service.get_patient_summary(db, Principal(subject=principal_nurse.subject, role="nurse"), UUID(patient))
        assert len(summary.active_consents) == 1
        assert summary.active_consents[0].doctor_user_id == UUID(principal_nurse.subject)


async def test_admin_override_writes_are_audited_and_self_read_does_not_grant_clinical_write(admin_client, patient_client, principal_patient, sessionmaker, vitals_payload):
    path = f"/v1/patients/{principal_patient.subject}/vitals"
    assert (await patient_client.post(path, json=vitals_payload)).status_code == 403
    assert (await admin_client.post(path, json=vitals_payload)).status_code == 201
    async with sessionmaker() as db:
        audit = await db.scalar(select(AccessAudit).where(AccessAudit.resource == "vital_write"))
        assert audit.reason.startswith("[admin_override]")
