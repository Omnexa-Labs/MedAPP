"""PHI access audit trail — hospital_service (`GET /{id}/staff`).

The roster is the odd one out in this change and the tests say so: the data
subjects here are STAFF, not patients, so `patient_id` is NULL by design and
the useful facts are the accessor, the hospital and the roster size. What this
endpoint is exposed to is bulk enumeration of an employment graph, and the row
is what turns that into a name and a timestamp.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select, text

from app.models import AccessAudit

# Planted in the roster's free-text fields, then swept for.
CLINICAL_SENTINELS = ("Consultant Oncologist", "Palliative Care", "A modern multispecialty hospital.")


async def _audit_rows(sessionmaker):
    async with sessionmaker() as session:
        result = await session.scalars(select(AccessAudit).order_by(AccessAudit.created_at.asc()))
        return list(result.all())


async def _hospital_with_staff(admin_client, hospital_sample, principal_doctor):
    create_resp = await admin_client.post("/v1/hospitals", json=hospital_sample)
    assert create_resp.status_code == 201, create_resp.text
    hospital_id = create_resp.json()["hospital_id"]
    staff_resp = await admin_client.post(
        f"/v1/hospitals/{hospital_id}/staff",
        json={
            "user_id": principal_doctor.subject,
            "role": "doctor",
            "title": CLINICAL_SENTINELS[0],
            "department": CLINICAL_SENTINELS[1],
        },
    )
    assert staff_resp.status_code == 201, staff_resp.text
    return hospital_id


@pytest.mark.asyncio
async def test_roster_read_writes_one_granted_row(
    patient_client, admin_client, sessionmaker, hospital_sample, principal_doctor, principal_patient
):
    hospital_id = await _hospital_with_staff(admin_client, hospital_sample, principal_doctor)
    # Creating the hospital and adding staff are writes, not audited reads.
    assert await _audit_rows(sessionmaker) == []

    resp = await patient_client.get(f"/v1/hospitals/{hospital_id}/staff")
    assert resp.status_code == 200

    rows = await _audit_rows(sessionmaker)
    assert len(rows) == 1
    row = rows[0]
    assert str(row.accessor_user_id) == principal_patient.subject
    assert row.accessor_role == "patient"
    assert row.resource == "hospital_staff_roster"
    assert str(row.resource_id) == hospital_id
    # NULL on purpose: the subjects are employees; a hospital is not a data
    # subject and inventing a patient here would be a false fact.
    assert row.patient_id is None
    assert row.outcome == "granted"
    assert row.record_count == 1
    assert row.admin_override is False


@pytest.mark.asyncio
async def test_admin_roster_read_is_not_tagged_as_an_override(
    admin_client, sessionmaker, hospital_sample, principal_doctor
):
    """A `hospital_admin` gets a WIDER projection (staff `user_id`s), which is
    not the same fact as bypassing authorization. If this ever flips to True,
    `WHERE admin_override IS TRUE` stops meaning "someone bypassed a rule"."""
    hospital_id = await _hospital_with_staff(admin_client, hospital_sample, principal_doctor)
    resp = await admin_client.get(f"/v1/hospitals/{hospital_id}/staff")
    assert resp.status_code == 200
    assert resp.json()["includes_user_ids"] is True

    rows = await _audit_rows(sessionmaker)
    assert len(rows) == 1
    assert rows[0].admin_override is False


@pytest.mark.asyncio
async def test_anonymous_roster_read_writes_no_row(
    anonymous_client, admin_client, sessionmaker, hospital_sample, principal_doctor
):
    """A caller with no token is refused by the auth dependency, BEFORE the
    service function runs, so there is no identified accessor to attribute a row
    to. Recorded here as a deliberate, documented hole rather than left to be
    discovered: unauthenticated attempts are visible only in `user_service`'s
    auth log today, and correlating the two is not built."""
    hospital_id = await _hospital_with_staff(admin_client, hospital_sample, principal_doctor)
    resp = await anonymous_client.get(f"/v1/hospitals/{hospital_id}/staff")
    assert resp.status_code == 401

    assert await _audit_rows(sessionmaker) == []


@pytest.mark.asyncio
async def test_roleless_principal_is_refused_and_recorded(
    admin_client, sessionmaker, hospital_sample, principal_doctor
):
    """The one reachable DENIAL on this endpoint, and it must leave a row.

    `list_staff` refuses a principal with an empty role defensively. It is the
    only refusal the service function itself can produce here — every real role
    may read a roster — so it is the only place this service can prove that a
    denied read is recorded and that the row survives the rollback the 403
    triggers.
    """
    from app.deps import get_current_principal, get_db
    from app.main import create_app
    from httpx import ASGITransport, AsyncClient
    from shared.auth import Principal

    hospital_id = await _hospital_with_staff(admin_client, hospital_sample, principal_doctor)

    roleless = Principal(subject="55555555-5555-5555-5555-555555555555", role="")

    async def _db_override():
        async with sessionmaker() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    application = create_app()
    application.dependency_overrides[get_db] = _db_override
    application.dependency_overrides[get_current_principal] = lambda: roleless
    async with AsyncClient(transport=ASGITransport(app=application), base_url="http://test") as client:
        resp = await client.get(f"/v1/hospitals/{hospital_id}/staff")
    assert resp.status_code == 403

    rows = await _audit_rows(sessionmaker)
    assert len(rows) == 1
    assert rows[0].outcome == "denied"
    assert rows[0].resource == "hospital_staff_roster"
    assert str(rows[0].accessor_user_id) == roleless.subject
    assert str(rows[0].resource_id) == hospital_id


@pytest.mark.asyncio
async def test_unknown_hospital_writes_no_row(patient_client, sessionmaker):
    """A roster that does not exist was not disclosed, and there is no subject
    to attribute the attempt to. 404s are not denials."""
    resp = await patient_client.get("/v1/hospitals/8f14e45f-0000-4000-8000-000000000000/staff")
    assert resp.status_code == 404
    assert await _audit_rows(sessionmaker) == []


@pytest.mark.asyncio
async def test_no_clinical_content_in_any_audit_row(
    patient_client, admin_client, sessionmaker, hospital_sample, principal_doctor
):
    hospital_id = await _hospital_with_staff(admin_client, hospital_sample, principal_doctor)
    await patient_client.get(f"/v1/hospitals/{hospital_id}/staff")
    await admin_client.get(f"/v1/hospitals/{hospital_id}/staff")

    rows = await _audit_rows(sessionmaker)
    assert rows, "the sweep proves nothing if nothing was recorded"
    columns = [column.name for column in AccessAudit.__table__.columns]
    for row in rows:
        blob = " ".join(str(getattr(row, name)) for name in columns).lower()
        for sentinel in CLINICAL_SENTINELS:
            assert sentinel.lower() not in blob, f"{sentinel!r} leaked into access_audit"
        for name in columns:
            value = getattr(row, name)
            if isinstance(value, str):
                assert len(value) <= 64, f"{name} looks like free text: {value!r}"


@pytest.mark.asyncio
async def test_audit_write_failure_fails_closed(
    patient_client, admin_client, engine, sessionmaker, hospital_sample, principal_doctor
):
    """No audit row, no roster. See `shared/audit/recorder.py` for why this
    trade-off was chosen over availability-first."""
    hospital_id = await _hospital_with_staff(admin_client, hospital_sample, principal_doctor)

    async with engine.begin() as connection:
        await connection.execute(text("DROP TABLE access_audit"))

    resp = await patient_client.get(f"/v1/hospitals/{hospital_id}/staff")
    assert resp.status_code == 503
    assert "audit" in resp.json()["detail"].lower()
    assert CLINICAL_SENTINELS[0] not in resp.text
