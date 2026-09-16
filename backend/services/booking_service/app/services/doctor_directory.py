"""Resolve the clinician identity before confirming a new booking.

Returns None on upstream failure; the booking write fails without reserving a
slot. Historical rows with NULL identity still deny practitioner access.
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
    try:
        client = _build_client()
        try:
            resp = await client.get(
                f"{DOCTORS_PATH}/{doctor_id}",
                headers={"Authorization": authorization} if authorization else {},
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
