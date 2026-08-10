"""Room provisioning bridge to telemedicine_service.

When a booking is created with `mode=video` it needs a telemedicine room.
telemedicine_service owns rooms and exposes
`POST /v1/rooms` -> 201 `RoomOut {room_id, booking_id, room_name, status, ...}`,
routed by the gateway at `/v1/rooms` and reachable inside the compose network
at `settings.telemedicine_service_url`.

**This call MUST NOT be able to fail a booking.** A patient who picked a slot
and pressed Confirm has made a commitment; losing it because a secondary
service was down is strictly the worse outcome — the slot may be gone by the
time they retry, and the clinician's calendar is the scarce resource. So
`provision_room` NEVER raises. Every failure path returns `None`, the booking
keeps `room_id = NULL`, and the client renders "video link pending" instead of
a dead join button. The failure is logged, not swallowed silently.

The pattern here follows `pharmacy_service/app/services/stock_service.py`,
which is the existing service-to-service caller in this repo: a bare
`httpx.AsyncClient` with a config-driven base URL and timeout, defensive on
every non-2xx and every network error.

Auth: the caller's own bearer token is forwarded. telemedicine_service's
`create_room` stamps `created_by_user_id` from the principal, so forwarding the
patient's token makes the patient the room's creator — which is true, and is
what its `_assert_participant` check expects. There is no service account in
this system, and inventing one here would be a second fabricated concept.

Idempotency comes for free: `create_room` returns the existing row when one
already has this `booking_id`, so a retry cannot produce two rooms.
"""

from __future__ import annotations

import logging
from uuid import UUID

import httpx

from ..config import settings
from ..models import Booking

log = logging.getLogger(__name__)

ROOMS_PATH = "/v1/rooms"


def _build_client() -> httpx.AsyncClient:
    """Seam for tests, which swap in an `httpx.MockTransport` client.

    Kept as a function rather than inlining the constructor so the tests can
    assert the real request — path, body and headers — instead of mocking out
    `provision_room` itself. A test that mocks the boundary cannot tell you the
    boundary is wrong; that lesson cost this project a round.
    """
    return httpx.AsyncClient(
        base_url=settings.telemedicine_service_url,
        timeout=settings.telemedicine_http_timeout_seconds,
    )


async def provision_room(booking: Booking, *, authorization: str | None) -> UUID | None:
    """Create the telemedicine room for a video booking.

    Returns the new `room_id`, or `None` if provisioning did not succeed for
    any reason. Never raises.
    """
    if not authorization:
        # Unreachable through the router (the endpoint is authenticated), but
        # a None here would produce a 401 from upstream, so name it.
        log.warning(
            "room_provision_no_credentials",
            extra={"booking_id": str(booking.id)},
        )
        return None

    payload = {
        "booking_id": str(booking.id),
        "patient_id": str(booking.user_id),
        "doctor_id": str(booking.doctor_id),
        "scheduled_for": booking.starts_at.isoformat(),
        "recording_enabled": False,
    }

    try:
        client = _build_client()
        try:
            resp = await client.post(
                ROOMS_PATH,
                json=payload,
                headers={"Authorization": authorization},
            )
        finally:
            await client.aclose()
    except httpx.HTTPError as exc:
        # Covers timeouts, connect errors, protocol errors. Do not put the
        # exception text in any response — it can carry internal hostnames.
        log.warning(
            "room_provision_network_error",
            extra={"booking_id": str(booking.id), "error": str(exc)},
        )
        return None

    if resp.status_code != httpx.codes.CREATED:
        log.warning(
            "room_provision_upstream_error",
            extra={"booking_id": str(booking.id), "status": resp.status_code},
        )
        return None

    try:
        room_id = UUID(str(resp.json()["room_id"]))
    except (ValueError, KeyError, TypeError) as exc:
        # A 201 whose body is not a RoomOut is an upstream contract break.
        # Storing a garbage id would be worse than storing none.
        log.warning(
            "room_provision_bad_response",
            extra={"booking_id": str(booking.id), "error": str(exc)},
        )
        return None

    log.info(
        "room_provisioned",
        extra={"booking_id": str(booking.id), "room_id": str(room_id)},
    )
    return room_id
