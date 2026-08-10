"""PHI access audit trail — booking_service.

What these tests pin, in the order the brief asks for it:

  * a GRANTED read writes exactly one row per data subject, with the right
    accessor, role, resource, subject, outcome and count;
  * a DENIED read writes a row — and SURVIVES the rollback that the 403
    triggers, which is the part that is easy to get wrong and impossible
    to notice;
  * NO clinical content reaches any row: the fixtures plant sentinel
    strings in `reason` / `notes` / `cancellation_reason` and the test
    sweeps every column of every row for them;
  * the fail-closed decision behaves as documented: no audit row, no
    patient data.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import select, text

from app.models import AccessAudit
from shared.auth import Principal

# The booking POST forwards the caller's Authorization header to doctor_service
# so `doctor_user_id` resolves; without it the link lands NULL and the
# practitioner schedule is legitimately empty.
AUTH = {"Authorization": "Bearer test-token"}

# Planted in the clinical free-text fields. If any of these ever turns up in
# `access_audit`, the audit table has become a second copy of the PHI.
CLINICAL_SENTINELS = (
    "suspected tuberculosis relapse",
    "patient is HIV positive and unaware",
    "cancelling after abnormal biopsy",
)


async def _audit_rows(session_factory):
    async with session_factory() as session:
        result = await session.scalars(select(AccessAudit).order_by(AccessAudit.created_at.asc()))
        return list(result.all())


async def _create_booking(client, doctor_profile_id, booking_window):
    starts_at, ends_at = booking_window
    response = await client.post(
        "/v1/bookings",
        json={
            "doctor_id": doctor_profile_id,
            "starts_at": starts_at.isoformat(),
            "ends_at": ends_at.isoformat(),
            "mode": "in_person",
            "reason": CLINICAL_SENTINELS[0],
            "notes": CLINICAL_SENTINELS[1],
        },
        headers=AUTH,
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_practitioner_schedule_writes_one_granted_row_per_patient(
    client_as, session_factory, principal, doctor_principal, linked_doctor, booking_window
):
    async with client_as(principal) as patient:
        await _create_booking(patient, linked_doctor, booking_window)

    # A booking creation is a WRITE and is not an audited read — the trail must
    # be empty at this point, otherwise later counts prove nothing.
    assert await _audit_rows(session_factory) == []

    async with client_as(doctor_principal) as doctor:
        response = await doctor.get("/v1/bookings/schedule")
    assert response.status_code == 200
    assert len(response.json()["items"]) == 1

    rows = await _audit_rows(session_factory)
    assert len(rows) == 1
    row = rows[0]
    assert str(row.accessor_user_id) == doctor_principal.subject
    assert row.accessor_role == "doctor"
    assert row.resource == "booking_schedule"
    assert str(row.patient_id) == principal.subject
    assert row.outcome == "granted"
    assert row.admin_override is False
    assert row.record_count == 1
    assert row.created_at is not None


@pytest.mark.asyncio
async def test_schedule_denied_for_non_practitioner_is_recorded(
    client_as, session_factory, principal
):
    """The denial row must survive `get_db`'s rollback.

    A 403 propagates out of the request, `get_db` calls `session.rollback()`,
    and a row that had only been flushed would vanish — the audit trail would
    silently contain granted reads only, which is the least interesting half.
    """
    async with client_as(principal) as patient:
        response = await patient.get("/v1/bookings/schedule")
    assert response.status_code == 403

    rows = await _audit_rows(session_factory)
    assert len(rows) == 1
    row = rows[0]
    assert row.outcome == "denied"
    assert row.resource == "booking_schedule"
    assert str(row.accessor_user_id) == principal.subject
    assert row.accessor_role == "user"
    # No subjects: the query that would have found them never ran, and an
    # invented subject would be a fabricated fact in an audit log.
    assert row.patient_id is None


@pytest.mark.asyncio
async def test_denied_booking_read_names_the_patient(
    client_as, session_factory, principal, other_doctor_principal, linked_doctor, booking_window
):
    """A refused single-record read records WHOSE record was refused."""
    async with client_as(principal) as patient:
        booking = await _create_booking(patient, linked_doctor, booking_window)

    async with client_as(other_doctor_principal) as intruder:
        response = await intruder.get(f"/v1/bookings/{booking['booking_id']}")
    assert response.status_code == 403

    rows = await _audit_rows(session_factory)
    assert len(rows) == 1
    assert rows[0].outcome == "denied"
    assert rows[0].resource == "booking"
    assert str(rows[0].resource_id) == booking["booking_id"]
    assert str(rows[0].patient_id) == principal.subject
    assert str(rows[0].accessor_user_id) == other_doctor_principal.subject


@pytest.mark.asyncio
async def test_admin_read_is_tagged_as_an_override(
    client_as, session_factory, principal, admin_principal, linked_doctor, booking_window
):
    async with client_as(principal) as patient:
        booking = await _create_booking(patient, linked_doctor, booking_window)

    async with client_as(admin_principal) as admin:
        response = await admin.get(f"/v1/bookings/{booking['booking_id']}")
    assert response.status_code == 200

    rows = await _audit_rows(session_factory)
    assert len(rows) == 1
    assert rows[0].admin_override is True
    assert rows[0].accessor_role == "admin"
    assert str(rows[0].patient_id) == principal.subject


@pytest.mark.asyncio
async def test_self_read_is_not_an_override(
    client_as, session_factory, principal, linked_doctor, booking_window
):
    """Guard against the lazy `role == "admin"` shortcut.

    An admin reading their own booking is not an override, and a patient
    reading their own certainly is not — if `admin_override` drifts into
    meaning "the caller happened to be privileged", the query the column
    exists for stops being useful.
    """
    async with client_as(principal) as patient:
        booking = await _create_booking(patient, linked_doctor, booking_window)
        response = await patient.get(f"/v1/bookings/{booking['booking_id']}")
    assert response.status_code == 200

    rows = await _audit_rows(session_factory)
    assert len(rows) == 1
    assert rows[0].admin_override is False
    assert rows[0].outcome == "granted"


@pytest.mark.asyncio
async def test_admin_list_all_bookings_is_tagged_and_counted(
    client_as, session_factory, principal, admin_principal, linked_doctor, booking_window
):
    async with client_as(principal) as patient:
        await _create_booking(patient, linked_doctor, booking_window)

    async with client_as(admin_principal) as admin:
        response = await admin.get("/v1/bookings?all_bookings=true")
    assert response.status_code == 200

    rows = await _audit_rows(session_factory)
    assert len(rows) == 1
    assert rows[0].resource == "booking_list"
    assert rows[0].admin_override is True
    assert str(rows[0].patient_id) == principal.subject
    assert rows[0].record_count == 1


@pytest.mark.asyncio
async def test_no_clinical_content_in_any_audit_row(
    client_as, session_factory, principal, doctor_principal, other_doctor_principal,
    admin_principal, linked_doctor, booking_window
):
    """Sweep EVERY column of EVERY row for the planted clinical strings.

    Deliberately not "assert the row has no `reason` column": a future column
    could reintroduce the leak, and this test would still catch it.
    """
    async with client_as(principal) as patient:
        booking = await _create_booking(patient, linked_doctor, booking_window)
        await patient.get(f"/v1/bookings/{booking['booking_id']}")
        await patient.get("/v1/bookings")
        await patient.get("/v1/bookings/summary")
        await patient.post(
            f"/v1/bookings/{booking['booking_id']}/cancel",
            json={"cancellation_reason": CLINICAL_SENTINELS[2]},
        )
    async with client_as(doctor_principal) as doctor:
        await doctor.get("/v1/bookings/schedule")
        await doctor.get("/v1/bookings/schedule/summary")
    async with client_as(other_doctor_principal) as intruder:
        await intruder.get(f"/v1/bookings/{booking['booking_id']}")  # 403
    async with client_as(admin_principal) as admin:
        await admin.get("/v1/bookings?all_bookings=true")

    rows = await _audit_rows(session_factory)
    assert rows, "the sweep proves nothing if nothing was recorded"

    columns = [column.name for column in AccessAudit.__table__.columns]
    for row in rows:
        blob = " ".join(str(getattr(row, name)) for name in columns).lower()
        for sentinel in CLINICAL_SENTINELS:
            assert sentinel.lower() not in blob, f"{sentinel!r} leaked into access_audit"
        # Belt and braces: no column may carry free text at all. Every value is
        # a uuid, a short enum-ish token, a timestamp, a bool or an int.
        for name in columns:
            value = getattr(row, name)
            if isinstance(value, str):
                assert len(value) <= 64, f"{name} looks like free text: {value!r}"


@pytest.mark.asyncio
async def test_audit_write_failure_fails_closed(
    client_as, engine, session_factory, principal, linked_doctor, booking_window
):
    """The documented failure mode: no audit row, no patient data.

    The audit table is dropped out from under the read to simulate "the
    migration has not run" / "the table is gone". The read must answer 503 and
    must NOT return the booking. If this test ever starts asserting 200, the
    service has been changed to fail OPEN and the module docstring in
    `shared/audit/recorder.py` is a lie.
    """
    async with client_as(principal) as patient:
        booking = await _create_booking(patient, linked_doctor, booking_window)

    async with engine.begin() as connection:
        await connection.execute(text("DROP TABLE access_audit"))

    async with client_as(principal) as patient:
        response = await patient.get(f"/v1/bookings/{booking['booking_id']}")

    assert response.status_code == 503
    assert "audit" in response.json()["detail"].lower()
    # And nothing about the booking came back with the error.
    assert booking["booking_id"] not in response.text


@pytest.mark.asyncio
async def test_summary_and_schedule_do_not_double_log(
    client_as, session_factory, principal, doctor_principal, linked_doctor, booking_window
):
    """One request, one set of rows.

    `get_practitioner_schedule_summary` delegates to
    `list_practitioner_schedule`, so without the `audit=False` handoff each
    summary request would write two sets of rows under two resource names and
    every count in the audit table would be wrong.
    """
    async with client_as(principal) as patient:
        await _create_booking(patient, linked_doctor, booking_window)

    async with client_as(doctor_principal) as doctor:
        response = await doctor.get("/v1/bookings/schedule/summary")
    assert response.status_code == 200

    rows = await _audit_rows(session_factory)
    assert [row.resource for row in rows] == ["booking_schedule_summary"]


@pytest.mark.asyncio
async def test_schedule_with_no_bookings_still_records_the_read(
    client_as, session_factory, doctor_principal
):
    """An empty result is still a read, and still attributable.

    With no bookings there is no patient subject, so the rule falls back to one
    subject-less row rather than silence. "Nobody read anything" and "somebody
    read an empty list" are different facts.
    """
    async with client_as(doctor_principal) as doctor:
        response = await doctor.get("/v1/bookings/schedule")
    assert response.status_code == 200

    rows = await _audit_rows(session_factory)
    assert len(rows) == 1
    assert rows[0].patient_id is None
    assert rows[0].record_count == 0
    assert rows[0].outcome == "granted"


@pytest.mark.asyncio
async def test_two_patients_produce_one_row_each(
    client_as, session_factory, principal, doctor_principal, linked_doctor, booking_window
):
    """The point of per-subject rows: TWO patients, TWO rows, one request.

    This is the test that would fail under the tempting design of one row per
    collection read. With a single `patient_id = NULL, record_count = 2` row,
    a data subject asking "who has looked at my appointments?" gets nothing
    back, which is the Act 843 s.32-35 request the log has to be able to answer.
    """
    second_patient = Principal(subject="44444444-4444-4444-4444-444444444444", role="user")
    starts_at, ends_at = booking_window

    async with client_as(principal) as patient:
        await _create_booking(patient, linked_doctor, (starts_at, ends_at))
    async with client_as(second_patient) as patient:
        # A later window: the same clinician cannot be double-booked.
        await _create_booking(
            patient, linked_doctor, (starts_at + timedelta(hours=2), ends_at + timedelta(hours=2))
        )

    async with client_as(doctor_principal) as doctor:
        response = await doctor.get("/v1/bookings/schedule")
    assert response.status_code == 200
    assert len(response.json()["items"]) == 2

    rows = await _audit_rows(session_factory)
    assert len(rows) == 2
    assert {str(row.patient_id) for row in rows} == {principal.subject, second_patient.subject}
    assert all(row.record_count == 1 for row in rows)
    assert all(row.resource == "booking_schedule" for row in rows)
