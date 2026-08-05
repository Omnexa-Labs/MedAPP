"""PHI access audit trail — lab_service.

This is the service where the audit row carries the most weight. A lab result
holds `raw_text`, `parsed_values` and `summary`, and `_can_access_result` now
admits the ORDERING clinician — so a doctor legitimately reads a record that is
not theirs, and the row written here is the only trace of it. The blanket
`role == "doctor"` grant that used to sit there is gone, but the audit row is
what would have made its exploitation visible, and now exists.

Deliberately exercised at the SERVICE-FUNCTION level rather than over HTTP: the
search path needs a Qdrant client, and the two reads that matter most
(`get_lab_result`, `list_my_results`) need nothing but a session and a
principal. Fewer moving parts between the assertion and the behaviour.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select, text

from app.models import AccessAudit, LabOrder, LabResult
from app.services.lab_service import LabError, get_lab_result, get_lab_summary, list_my_results
from shared.auth import Principal

RAW_TEXT_SENTINEL = "HIV-1 RNA 45000 copies/mL"
SUMMARY_SENTINEL = "consistent with advanced disease"
TITLE_SENTINEL = "HIV viral load panel"


async def _audit_rows(sessionmaker):
    async with sessionmaker() as session:
        result = await session.scalars(select(AccessAudit).order_by(AccessAudit.created_at.asc()))
        return list(result.all())


async def _seed(sessionmaker, *, patient_id, ordering_doctor_id=None):
    """A result, optionally attached to an order placed by a given clinician."""
    async with sessionmaker() as session:
        order_id = None
        if ordering_doctor_id is not None:
            order = LabOrder(
                patient_id=patient_id,
                ordered_by_user_id=ordering_doctor_id,
                test_name=TITLE_SENTINEL,
                priority="routine",
            )
            session.add(order)
            await session.flush()
            order_id = order.id
        result = LabResult(
            patient_id=patient_id,
            lab_order_id=order_id,
            uploaded_by_user_id=patient_id,
            source="lab_partner",
            title=TITLE_SENTINEL,
            summary=SUMMARY_SENTINEL,
            raw_text=RAW_TEXT_SENTINEL,
            parsed_values={"viral_load": 45000},
            resulted_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
        session.add(result)
        await session.commit()
        return result.id


@pytest.mark.asyncio
async def test_ordering_clinician_read_writes_one_granted_row(
    sessionmaker, principal_patient, principal_doctor
):
    patient_id = uuid4()
    doctor_id = uuid4()
    result_id = await _seed(sessionmaker, patient_id=patient_id, ordering_doctor_id=doctor_id)
    doctor = Principal(subject=str(doctor_id), role="doctor")

    async with sessionmaker() as session:
        result = await get_lab_result(session, doctor, result_id)
        await session.commit()
    assert result.id == result_id

    rows = await _audit_rows(sessionmaker)
    assert len(rows) == 1
    row = rows[0]
    assert row.resource == "lab_result"
    assert str(row.resource_id) == str(result_id)
    assert str(row.accessor_user_id) == str(doctor_id)
    assert row.accessor_role == "doctor"
    assert str(row.patient_id) == str(patient_id)
    assert row.outcome == "granted"
    # A treating relationship is not an override.
    assert row.admin_override is False


@pytest.mark.asyncio
async def test_unrelated_doctor_read_is_denied_and_recorded(sessionmaker):
    """The row that matters most in this file.

    A doctor with no ordering relationship is refused — and the refusal is
    recorded against the patient whose result was targeted, which is what makes
    a pattern of probing findable at all. The row must survive the rollback that
    the 403 triggers.
    """
    patient_id = uuid4()
    result_id = await _seed(sessionmaker, patient_id=patient_id, ordering_doctor_id=uuid4())
    intruder = Principal(subject=str(uuid4()), role="doctor")

    async with sessionmaker() as session:
        with pytest.raises(HTTPException) as excinfo:
            await get_lab_result(session, intruder, result_id)
        assert excinfo.value.status_code == 403

    rows = await _audit_rows(sessionmaker)
    assert len(rows) == 1
    row = rows[0]
    assert row.outcome == "denied"
    assert row.resource == "lab_result"
    assert str(row.accessor_user_id) == intruder.subject
    assert str(row.patient_id) == str(patient_id)
    assert str(row.resource_id) == str(result_id)


@pytest.mark.asyncio
async def test_admin_read_is_tagged_and_self_read_is_not(sessionmaker):
    patient_id = uuid4()
    result_id = await _seed(sessionmaker, patient_id=patient_id)

    admin = Principal(subject=str(uuid4()), role="admin")
    async with sessionmaker() as session:
        await get_lab_result(session, admin, result_id)
        await session.commit()

    patient = Principal(subject=str(patient_id), role="patient")
    async with sessionmaker() as session:
        await get_lab_result(session, patient, result_id)
        await session.commit()

    rows = await _audit_rows(sessionmaker)
    assert len(rows) == 2
    by_role = {row.accessor_role: row for row in rows}
    assert by_role["admin"].admin_override is True
    assert by_role["patient"].admin_override is False


@pytest.mark.asyncio
async def test_admin_reading_own_result_is_not_an_override(sessionmaker):
    """Guards the shortcut `admin_override = role == "admin"`, which would
    mislabel an admin who is also a patient of the platform and make
    `WHERE admin_override IS TRUE` noisier than the thing it is hunting."""
    admin_id = uuid4()
    result_id = await _seed(sessionmaker, patient_id=admin_id)
    admin = Principal(subject=str(admin_id), role="admin")

    async with sessionmaker() as session:
        await get_lab_result(session, admin, result_id)
        await session.commit()

    rows = await _audit_rows(sessionmaker)
    assert len(rows) == 1
    assert rows[0].admin_override is False


@pytest.mark.asyncio
async def test_list_and_summary_record_counts_not_content(sessionmaker):
    patient_id = uuid4()
    await _seed(sessionmaker, patient_id=patient_id)
    await _seed(sessionmaker, patient_id=patient_id)
    patient = Principal(subject=str(patient_id), role="patient")

    async with sessionmaker() as session:
        results = await list_my_results(session, patient)
        await session.commit()
    assert len(results) == 2

    async with sessionmaker() as session:
        await get_lab_summary(session, patient)
        await session.commit()

    rows = await _audit_rows(sessionmaker)
    assert [row.resource for row in rows] == ["lab_result_list", "lab_summary"]
    assert rows[0].record_count == 2
    assert all(str(row.patient_id) == str(patient_id) for row in rows)


@pytest.mark.asyncio
async def test_no_clinical_content_in_any_audit_row(sessionmaker):
    patient_id = uuid4()
    result_id = await _seed(sessionmaker, patient_id=patient_id, ordering_doctor_id=uuid4())
    patient = Principal(subject=str(patient_id), role="patient")
    intruder = Principal(subject=str(uuid4()), role="doctor")

    async with sessionmaker() as session:
        await get_lab_result(session, patient, result_id)
        await list_my_results(session, patient)
        await get_lab_summary(session, patient)
        await session.commit()
    async with sessionmaker() as session:
        with pytest.raises(HTTPException):
            await get_lab_result(session, intruder, result_id)

    rows = await _audit_rows(sessionmaker)
    assert rows, "the sweep proves nothing if nothing was recorded"
    columns = [column.name for column in AccessAudit.__table__.columns]
    for row in rows:
        blob = " ".join(str(getattr(row, name)) for name in columns).lower()
        for sentinel in (RAW_TEXT_SENTINEL, SUMMARY_SENTINEL, TITLE_SENTINEL, "45000"):
            assert sentinel.lower() not in blob, f"{sentinel!r} leaked into access_audit"
        for name in columns:
            value = getattr(row, name)
            if isinstance(value, str):
                assert len(value) <= 64, f"{name} looks like free text: {value!r}"


@pytest.mark.asyncio
async def test_missing_result_writes_no_row(sessionmaker, principal_patient):
    """A `result_id` that does not exist has no data subject, so an access log
    is the wrong place for it. Documented, not accidental."""
    patient = Principal(subject=str(uuid4()), role="patient")
    async with sessionmaker() as session:
        with pytest.raises(LabError):
            await get_lab_result(session, patient, uuid4())
    assert await _audit_rows(sessionmaker) == []


@pytest.mark.asyncio
async def test_audit_write_failure_fails_closed(sessionmaker, engine):
    """No audit row, no lab result — and the failure is an exception, never a
    silently unlogged success."""
    patient_id = uuid4()
    result_id = await _seed(sessionmaker, patient_id=patient_id)
    patient = Principal(subject=str(patient_id), role="patient")

    async with engine.begin() as connection:
        await connection.execute(text("DROP TABLE access_audit"))

    async with sessionmaker() as session:
        with pytest.raises(HTTPException) as excinfo:
            await get_lab_result(session, patient, result_id)
    assert excinfo.value.status_code == 503
    assert "audit" in str(excinfo.value.detail).lower()
