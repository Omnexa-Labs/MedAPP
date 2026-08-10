"""The practitioner schedule, and the IDOR it must not have.

These tests exist mainly to pin an ACCESS RULE, not a feature. The rule is:
a clinician sees a booking iff `bookings.doctor_user_id` equals their token
subject. Everything else here — the minimised payload, the fail-closed NULL, the
403 for patients — is a consequence of that rule, and each consequence gets its
own test so a regression names itself.

The one test worth reading twice is
`test_doctor_id_query_param_cannot_widen_the_patient_view`: it is the exploit the
old code allowed, written as an assertion that it no longer works.

`linked_doctor` (conftest) means "doctor_service is up and knows this profile".
A test that does NOT request it is exercising the unresolved / fail-closed path.
"""

from __future__ import annotations

from datetime import timedelta

import httpx
import pytest
from app.services import doctor_directory
from fastapi import status

AUTH = {"Authorization": "Bearer test-token"}


def _payload(booking_window, doctor_id: str, **overrides):
    start, end = booking_window
    body = {
        "doctor_id": doctor_id,
        "starts_at": start.isoformat(),
        "ends_at": end.isoformat(),
        "reason": "Persistent headaches",
        "notes": "Patient reports light sensitivity",
    }
    body.update(overrides)
    return body


async def _book(client, booking_window, doctor_id: str, **overrides):
    resp = await client.post(
        "/v1/bookings",
        json=_payload(booking_window, doctor_id, **overrides),
        headers=AUTH,
    )
    assert resp.status_code == status.HTTP_201_CREATED, resp.text
    return resp.json()


async def test_doctor_sees_bookings_where_they_are_the_clinician(
    client_as, principal, doctor_principal, linked_doctor, booking_window
):
    async with client_as(principal) as patient:
        created = await _book(patient, booking_window, linked_doctor)

    async with client_as(doctor_principal) as doctor:
        resp = await doctor.get("/v1/bookings/schedule", headers=AUTH)

    assert resp.status_code == status.HTTP_200_OK, resp.text
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["booking_id"] == created["booking_id"]
    # The patient is identified by an opaque user id, not a name: booking_service
    # holds no names and must not start resolving them for a list view.
    assert items[0]["patient_id"] == principal.subject


async def test_schedule_payload_is_minimised(
    client_as, principal, doctor_principal, linked_doctor, booking_window
):
    """No clinical free text, and no restating of the caller's own identity."""
    async with client_as(principal) as patient:
        await _book(patient, booking_window, linked_doctor)

    async with client_as(doctor_principal) as doctor:
        resp = await doctor.get("/v1/bookings/schedule", headers=AUTH)

    item = resp.json()["items"][0]
    assert set(item) == {
        "booking_id",
        "patient_id",
        "starts_at",
        "ends_at",
        "status",
        "mode",
        "room_id",
    }
    # Asserted by name as well as by the set above, so a future field addition
    # that happens to re-admit one of these fails loudly right here.
    for withheld in ("notes", "reason", "cancellation_reason", "doctor_id", "doctor_user_id"):
        assert withheld not in item


async def test_doctor_cannot_see_another_clinicians_bookings(
    client_as, principal, other_doctor_principal, linked_doctor, booking_window
):
    async with client_as(principal) as patient:
        await _book(patient, booking_window, linked_doctor)

    async with client_as(other_doctor_principal) as intruder:
        resp = await intruder.get("/v1/bookings/schedule", headers=AUTH)

    assert resp.status_code == status.HTTP_200_OK, resp.text
    assert resp.json()["items"] == []


async def test_doctor_id_query_param_cannot_widen_the_patient_view(
    client_as,
    principal,
    other_doctor_principal,
    linked_doctor,
    other_doctor_profile_id,
    booking_window,
):
    """The old IDOR, as a regression test.

    Before this change, `GET /v1/bookings?doctor_id=<any profile>` was the only
    doctor-centric list available, and the parameter was trusted. Here a
    clinician who owns NEITHER profile asks for both; the parameter is only a
    filter over "bookings where I am the patient", so the answer is empty
    whatever they pass.
    """
    async with client_as(principal) as patient:
        await _book(patient, booking_window, linked_doctor)

    async with client_as(other_doctor_principal) as intruder:
        for probe in (linked_doctor, other_doctor_profile_id):
            resp = await intruder.get("/v1/bookings", params={"doctor_id": probe}, headers=AUTH)
            assert resp.status_code == status.HTTP_200_OK, resp.text
            assert resp.json()["items"] == [], probe

        # And the admin-only escape hatch stays admin-only.
        resp = await intruder.get("/v1/bookings", params={"all_bookings": "true"}, headers=AUTH)
        assert resp.status_code == status.HTTP_403_FORBIDDEN


async def test_null_doctor_user_id_row_is_invisible(
    client_as, principal, doctor_principal, doctor_profile_id, booking_window
):
    """Fail closed: an unresolved clinician link denies, it does not allow.

    `linked_doctor` is deliberately not requested, so the stub doctor_service
    404s and the row is written with `doctor_user_id = NULL`. The booking must
    still be created — the patient's slot survives a doctor_service outage — but
    it must not appear in anyone's schedule until the backfill repairs it.
    """
    async with client_as(principal) as patient:
        created = await _book(patient, booking_window, doctor_profile_id)

    async with client_as(doctor_principal) as doctor:
        resp = await doctor.get("/v1/bookings/schedule", headers=AUTH)
        assert resp.json()["items"] == []
        # Not even the detail read, which authorises on the same column.
        detail = await doctor.get(f"/v1/bookings/{created['booking_id']}", headers=AUTH)
        assert detail.status_code == status.HTTP_403_FORBIDDEN


async def test_doctor_service_outage_does_not_fail_the_booking(
    monkeypatch, client_as, principal, doctor_principal, doctor_profile_id, booking_window
):
    """A network failure resolving the clinician must not cost the patient the slot."""

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("doctor_service unreachable", request=request)

    monkeypatch.setattr(
        doctor_directory,
        "_build_client",
        lambda: httpx.AsyncClient(
            base_url="http://doctor_service:8002",
            transport=httpx.MockTransport(handler),
        ),
    )

    async with client_as(principal) as patient:
        await _book(patient, booking_window, doctor_profile_id)

    async with client_as(doctor_principal) as doctor:
        resp = await doctor.get("/v1/bookings/schedule", headers=AUTH)
        assert resp.json()["items"] == []


async def test_resolution_calls_doctor_service_correctly(
    client_as, principal, linked_doctor, doctor_service_calls, booking_window
):
    """Assert the real outbound request, not a mocked function."""
    async with client_as(principal) as patient:
        await _book(patient, booking_window, linked_doctor)

    assert len(doctor_service_calls) == 1
    request = doctor_service_calls[0]
    assert request.method == "GET"
    assert request.url.path == f"/v1/doctors/{linked_doctor}"
    assert request.headers["Authorization"] == "Bearer test-token"


@pytest.mark.parametrize("path", ["/v1/bookings/schedule", "/v1/bookings/schedule/summary"])
async def test_patient_cannot_use_the_practitioner_view(client_as, principal, path):
    async with client_as(principal) as patient:
        resp = await patient.get(path, headers=AUTH)
    assert resp.status_code == status.HTTP_403_FORBIDDEN
    assert "practitioner" in resp.json()["detail"]


async def test_admin_is_not_a_practitioner(client_as, admin_principal):
    """Admins read everything through `?all_bookings=true`, not through this.

    Pinned because "admin can do anything" is the reflex that would quietly turn
    `PRACTITIONER_ROLES` into a wildcard.
    """
    async with client_as(admin_principal) as admin:
        resp = await admin.get("/v1/bookings/schedule", headers=AUTH)
    assert resp.status_code == status.HTTP_403_FORBIDDEN


async def test_schedule_summary_counts_and_next_consultations(
    client_as, principal, doctor_principal, linked_doctor, booking_window
):
    start, end = booking_window

    async with client_as(principal) as patient:
        first = await _book(patient, booking_window, linked_doctor)
        await _book(
            patient,
            booking_window,
            linked_doctor,
            starts_at=(start + timedelta(hours=2)).isoformat(),
            ends_at=(end + timedelta(hours=2)).isoformat(),
            reason="Second slot",
        )
        cancelled = await patient.post(
            f"/v1/bookings/{first['booking_id']}/cancel",
            json={"cancellation_reason": "conflict"},
            headers=AUTH,
        )
        assert cancelled.status_code == status.HTTP_200_OK, cancelled.text

    async with client_as(doctor_principal) as doctor:
        resp = await doctor.get("/v1/bookings/schedule/summary", headers=AUTH)

    assert resp.status_code == status.HTTP_200_OK, resp.text
    body = resp.json()
    assert body["total_count"] == 2
    assert body["booked_count"] == 1
    assert body["cancelled_count"] == 1
    assert len(body["upcoming_bookings"]) == 1
    # The summary embeds the same minimised projection as the list.
    assert "notes" not in body["upcoming_bookings"][0]


async def test_treating_clinician_can_read_detail_but_not_cancel(
    client_as, principal, doctor_principal, linked_doctor, booking_window
):
    """Read is widened to the treating clinician; write is not.

    The detail read is where the clinical free text lives, and it has to be
    reachable or the minimisation above would just push clients into demanding
    `notes` back in the list. Cancellation stays with the patient: a
    clinician-initiated cancellation is a workflow with its own notification,
    and reusing the patient's endpoint would ship it undesigned.
    """
    async with client_as(principal) as patient:
        created = await _book(patient, booking_window, linked_doctor)

    async with client_as(doctor_principal) as doctor:
        detail = await doctor.get(f"/v1/bookings/{created['booking_id']}", headers=AUTH)
        assert detail.status_code == status.HTTP_200_OK, detail.text
        assert detail.json()["notes"] == "Patient reports light sensitivity"

        cancel = await doctor.post(
            f"/v1/bookings/{created['booking_id']}/cancel",
            json={"cancellation_reason": "clinic closed"},
            headers=AUTH,
        )
        assert cancel.status_code == status.HTTP_403_FORBIDDEN


async def test_unrelated_clinician_cannot_read_detail(
    client_as, principal, other_doctor_principal, linked_doctor, booking_window
):
    async with client_as(principal) as patient:
        created = await _book(patient, booking_window, linked_doctor)

    async with client_as(other_doctor_principal) as intruder:
        detail = await intruder.get(f"/v1/bookings/{created['booking_id']}", headers=AUTH)
    assert detail.status_code == status.HTTP_403_FORBIDDEN
