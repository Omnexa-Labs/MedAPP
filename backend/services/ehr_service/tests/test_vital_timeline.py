from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from app.models.record import AccessAudit, PatientRecord, VitalReading

pytestmark = pytest.mark.asyncio


async def seed(sessionmaker, user_id, rows):
    async with sessionmaker() as db:
        patient = PatientRecord(user_id=UUID(user_id))
        db.add(patient)
        await db.flush()
        for row in rows:
            db.add(VitalReading(patient_id=patient.id, recorded_by_user_id=uuid4(), **row))
        await db.commit()


async def test_equal_timestamp_paging_has_no_duplicates_or_missing_rows(patient_client, principal_patient, sessionmaker):
    now = datetime.now(UTC)
    await seed(sessionmaker, principal_patient.subject, [{"kind": "blood_pressure", "value": f"{110+i}/80", "recorded_at": now} for i in range(7)])
    path = f"/v1/patients/{principal_patient.subject}/vitals"
    result, cursor = [], None
    for _ in range(4):
        params = {"limit": 2}
        if cursor: params["cursor"] = cursor
        response = await patient_client.get(path, params=params)
        assert response.status_code == 200, response.text
        assert response.headers["cache-control"] == "no-store"
        result.extend(row["vital_id"] for row in response.json()["items"])
        cursor = response.json()["next_cursor"]
    assert len(result) == len(set(result)) == 7 and cursor is None
    assert result == sorted(result, reverse=True)


async def test_date_and_human_readable_type_filter_preserves_wire_values(patient_client, principal_patient, sessionmaker):
    now = datetime.now(UTC)
    await seed(sessionmaker, principal_patient.subject, [
        {"kind": "blood_pressure", "value": "122/80", "unit": "mmHg", "recorded_at": now},
        {"kind": "pulse", "value": "70", "unit": "bpm", "recorded_at": now},
        {"kind": "blood_pressure", "value": "118/75", "recorded_at": now-timedelta(days=10)},
    ])
    path=f"/v1/patients/{principal_patient.subject}/vitals"
    body=(await patient_client.get(path, params={"limit":25,"kind":"BLOOD PRESSURE","from_date":(now-timedelta(days=1)).isoformat()})).json()
    assert len(body["items"]) == 1
    assert body["items"][0]["value"] == "122/80" and body["items"][0]["unit"] == "mmHg"
    assert (await patient_client.get(path,params={"limit":25,"kind":"%"})).json()["items"] == []


async def test_paging_is_patient_scoped_and_checks_revocation(patient_client, doctor_client, principal_patient, principal_doctor, sessionmaker):
    now=datetime.now(UTC)
    await seed(sessionmaker, principal_patient.subject, [{"kind":"pulse","value":"70","recorded_at":now}])
    path=f"/v1/patients/{principal_patient.subject}"
    assert (await doctor_client.get(path+"/vitals?limit=25")).status_code == 403
    grant=await patient_client.post(path+"/consents",json={"doctor_user_id":principal_doctor.subject})
    assert grant.status_code == 201
    assert (await doctor_client.get(path+"/vitals?limit=25")).status_code == 200
    assert (await patient_client.get(f"/v1/patients/{uuid4()}/vitals?limit=25")).status_code == 403
    await patient_client.delete(path+"/consents/"+grant.json()["consent_id"])
    assert (await doctor_client.get(path+"/vitals?limit=25")).status_code == 403
    async with sessionmaker() as db:
        assert await db.scalar(select(AccessAudit).where(AccessAudit.reason=="paged vital timeline")) is not None


@pytest.mark.parametrize("params", [{"limit":0},{"limit":101},{"limit":2,"cursor":"not-a-cursor"},{"cursor":"orphan"},{"kind":"pulse"},{"limit":2,"from_date":"2026-09-13T00:00:00Z","to_date":"2026-09-12T00:00:00Z"}])
async def test_invalid_paging_filters_rejected(patient_client, principal_patient, params):
    response=await patient_client.get(f"/v1/patients/{principal_patient.subject}/vitals",params=params)
    assert response.status_code == 422


async def test_newer_insert_does_not_shift_second_page(patient_client, principal_patient, sessionmaker):
    now=datetime.now(UTC)
    await seed(sessionmaker,principal_patient.subject,[{"kind":"pulse","value":str(70+i),"recorded_at":now-timedelta(minutes=i)} for i in range(4)])
    path=f"/v1/patients/{principal_patient.subject}/vitals"
    first=(await patient_client.get(path,params={"limit":2})).json()
    async with sessionmaker() as db:
        patient=await db.scalar(select(PatientRecord).where(PatientRecord.user_id==UUID(principal_patient.subject)))
        db.add(VitalReading(patient_id=patient.id,recorded_by_user_id=uuid4(),kind="pulse",value="99",recorded_at=now+timedelta(minutes=1)))
        await db.commit()
    second=(await patient_client.get(path,params={"limit":2,"cursor":first["next_cursor"]})).json()
    assert [row["value"] for row in second["items"]] == ["72","73"]
    assert second["next_cursor"] is None
