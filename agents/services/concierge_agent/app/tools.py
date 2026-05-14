"""Tools exposed to Claude. Each is a thin wrapper around a MedApp service.

The agent passes `patient_id` to every tool that touches PHI; we forward it as
an `X-Patient-Id` header so downstream services can enforce row-level access.
"""
from __future__ import annotations

import json

import httpx
from anthropic import beta_tool

from .config import settings

# Module-level HTTP client so tool calls don't re-establish connections.
# The async client is reused inside the sync @beta_tool functions via asyncio.run
# in the agent loop is wrong — we instead use sync httpx here because the
# tool runner is sync. The agent's /chat endpoint runs the runner in a thread.
_client = httpx.Client(
    timeout=10.0,
    headers={"Authorization": f"Bearer {settings.service_token}"},
)


def _hdr(patient_id: str) -> dict[str, str]:
    return {"X-Patient-Id": patient_id}


@beta_tool
def search_providers(
    specialty: str,
    patient_id: str,
    lat: float | None = None,
    lng: float | None = None,
    radius_km: int = 20,
    min_rating: float = 0.0,
) -> str:
    """Find doctors, nurses, or hospitals matching a specialty near a location.

    Args:
        specialty: Medical specialty, e.g. "cardiology", "pediatrics".
        patient_id: The patient making the request (for access control).
        lat: Patient latitude (optional).
        lng: Patient longitude (optional).
        radius_km: Max distance in kilometres.
        min_rating: Minimum average rating (0-5).
    """
    params = {"specialty": specialty, "radius_km": radius_km, "min_rating": min_rating}
    if lat is not None and lng is not None:
        params.update({"lat": lat, "lng": lng})
    r = _client.get(
        f"{settings.doctor_service_url}/doctors",
        params=params,
        headers=_hdr(patient_id),
    )
    r.raise_for_status()
    return json.dumps(r.json())


@beta_tool
def get_doctor_availability(doctor_id: str, patient_id: str, days_ahead: int = 14) -> str:
    """Return open slots for a doctor over the next `days_ahead` days."""
    r = _client.get(
        f"{settings.doctor_service_url}/doctors/{doctor_id}/availability",
        params={"days_ahead": days_ahead},
        headers=_hdr(patient_id),
    )
    r.raise_for_status()
    return json.dumps(r.json())


@beta_tool
def create_booking(
    patient_id: str,
    provider_type: str,
    provider_id: str,
    slot_start: str,
    notes: str = "",
) -> str:
    """Book an appointment. Returns the booking id and a payment intent.

    Args:
        patient_id: Patient making the booking.
        provider_type: "doctor" | "nurse" | "hospital".
        provider_id: ID of the chosen provider.
        slot_start: ISO 8601 start time.
        notes: Reason for visit (visible to the provider).
    """
    body = {
        "provider_type": provider_type,
        "provider_id": provider_id,
        "slot_start": slot_start,
        "notes": notes,
    }
    r = _client.post(
        f"{settings.booking_service_url}/bookings",
        json=body,
        headers=_hdr(patient_id),
    )
    r.raise_for_status()
    return json.dumps(r.json())


@beta_tool
def get_ehr_summary(patient_id: str) -> str:
    """Return a structured summary of the patient's medical record: conditions,
    medications, allergies, recent visits, latest vitals."""
    r = _client.get(
        f"{settings.ehr_service_url}/records/{patient_id}/summary",
        headers=_hdr(patient_id),
    )
    r.raise_for_status()
    return json.dumps(r.json())


@beta_tool
def send_notification(patient_id: str, channel: str, title: str, body: str) -> str:
    """Send the patient a push/SMS/email notification.

    Args:
        channel: "push" | "sms" | "email".
        title: Short title.
        body: Message body.
    """
    payload = {"channel": channel, "title": title, "body": body}
    r = _client.post(
        f"{settings.notification_service_url}/notifications",
        json=payload,
        headers=_hdr(patient_id),
    )
    r.raise_for_status()
    return json.dumps(r.json())


ALL_TOOLS = [
    search_providers,
    get_doctor_availability,
    create_booking,
    get_ehr_summary,
    send_notification,
]
