"""Resolve a doctor_service profile id to the user_service user that owns it.

WHY THIS FILE EXISTS — THE TWO ID SPACES
----------------------------------------
`Booking.doctor_id` is a **doctor_service profile id**. `Principal.subject` is
a **user_service user id**. They are different id spaces for the same human:
`scripts/seed_dev_data.py` creates a user row and then a separate doctor
profile row over HTTP, and the two UUIDs never match. `Principal` carries only
`subject` and `role` — there is no doctor profile id in the token.

That mismatch is why the old `GET /v1/bookings?doctor_id=<uuid>` could not be
an authorization boundary. A client-supplied profile id proves nothing about
the caller, so trusting it would let any clinician read any other clinician's
patients' bookings — a straight IDOR over PHI.

THE FIX AND THE ALTERNATIVES WE REJECTED
----------------------------------------
We denormalise: `Booking.doctor_user_id` is written here, once, at booking
creation, and every practitioner read then compares it to `principal.subject`
with a purely local query. Rejected:

* **Resolve at read time (call doctor_service on every list).** Correct, and it
  needs no migration or backfill, but it makes an authorization decision
  depend on a network call. Under load or during a doctor_service outage the
  only safe answer is 403, so the practitioner's whole schedule disappears
  exactly when the platform is already degraded — and the pressure to "just
  allow it on timeout" is how checks come to fail open. We would rather pay the
  cost once, on write.
* **Put the doctor profile id in the JWT.** No network call at read time, but
  it requires the token issuer (user_service) to know about doctor_service, and
  the claim goes stale the moment a profile is reassigned or re-created — a
  stale claim on an authorization path is a silent grant.

The cost of our choice, stated plainly: rows written before this change, and
rows whose resolution failed, have `doctor_user_id = NULL`. **NULL is DENY**
(`services/booking_service.py`), never "allowed" — so those bookings are
invisible in the practitioner schedule until
`scripts/backfill_booking_doctor_user_id.py` repairs them. A doctor missing an
appointment from their schedule is a real clinical risk, which is why the
failure is logged loudly and the backfill ships with the migration.

FAILURE POLICY ON THE WRITE PATH
--------------------------------
This function NEVER raises, exactly like `provision_room` next door. A patient
who pressed Confirm must not lose their slot because doctor_service was down;
the booking is the thing that must survive. So a failure here yields NULL,
which costs the doctor visibility (recoverable, by backfill) instead of costing
the patient the appointment (not recoverable — the slot may be gone).

Auth: the caller's own bearer token is forwarded, matching
`services/telemedicine.py`. There is no service account in this system.
`GET /v1/doctors/{doctor_id}` is in fact unauthenticated in doctor_service
today and already returns `user_id` in `DoctorProfileOut`, so no new
cross-service surface was added for this; the header is sent anyway so this
call keeps working if that endpoint is later closed.
"""

from __future__ import annotations

import logging
from uuid import UUID

import httpx

from ..config import settings

log = logging.getLogger(__name__)

DOCTORS_PATH = "/v1/doctors"


def _build_client() -> httpx.AsyncClient:
    """Seam for tests, which swap in an `httpx.MockTransport` client.

    Same rationale as `telemedicine._build_client`: tests assert the real
    request rather than mocking out the function under test.
    """
    return httpx.AsyncClient(
        base_url=settings.doctor_service_url,
        timeout=settings.doctor_http_timeout_seconds,
    )


async def resolve_doctor_user_id(doctor_id: UUID, *, authorization: str | None) -> UUID | None:
    """Return the user_service user id owning `doctor_id`, or None.

    None means "unresolved", which every read path treats as deny. Never
    raises.

    Logging note: `doctor_id` is a professional-directory identifier already
    exposed on public endpoints, not patient data, so it is safe in a log line.
    No patient id, no reason, no notes are logged here.
    """
    if not authorization:
        log.warning("doctor_resolve_no_credentials", extra={"doctor_id": str(doctor_id)})
        return None

    try:
        client = _build_client()
        try:
            resp = await client.get(
                f"{DOCTORS_PATH}/{doctor_id}",
                headers={"Authorization": authorization},
            )
        finally:
            await client.aclose()
    except httpx.HTTPError as exc:
        # Timeouts, connect errors, protocol errors. The exception text stays
        # out of any response body — it can carry internal hostnames.
        log.warning(
            "doctor_resolve_network_error",
            extra={"doctor_id": str(doctor_id), "error": str(exc)},
        )
        return None

    if resp.status_code != httpx.codes.OK:
        log.warning(
            "doctor_resolve_upstream_error",
            extra={"doctor_id": str(doctor_id), "status": resp.status_code},
        )
        return None

    try:
        return UUID(str(resp.json()["user_id"]))
    except (ValueError, KeyError, TypeError) as exc:
        # A 200 whose body is not a DoctorProfileOut is an upstream contract
        # break. Storing a garbage id here would be worse than storing none:
        # a wrong id is a grant to the wrong clinician.
        log.warning(
            "doctor_resolve_bad_response",
            extra={"doctor_id": str(doctor_id), "error": str(exc)},
        )
        return None
