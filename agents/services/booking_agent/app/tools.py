"""Tools for the Booking agent.

The agent's job is multi-turn booking workflows that the Concierge delegates
to. Most tools wrap booking_service / doctor_service endpoints; the
`process_payment` tool is an **honest stub** until the payment flow is
re-audited (the audit flagged Stripe webhook signing as a critical issue;
slot machine UX is in scope only after that hardens).
"""
from __future__ import annotations

import json
from typing import Any

import httpx

from agents.shared import ToolSpec

from .config import settings

_client = httpx.Client(
    timeout=10.0,
    headers={"Authorization": f"Bearer {settings.service_token}"},
)


def _hdr(patient_id: str) -> dict[str, str]:
    return {"X-Patient-Id": patient_id}


TOOLS: list[ToolSpec] = [
    ToolSpec(
        name="search_providers",
        description=(
            "Find doctors, nurses, or hospitals matching a specialty near a "
            "location. Use when the user hasn't picked a provider yet."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "specialty": {
                    "type": "string",
                    "description": "Medical specialty, e.g. cardiology, dermatology, paediatrics",
                },
                "lat": {"type": "number"},
                "lng": {"type": "number"},
                "radius_km": {"type": "integer", "default": 20},
                "min_rating": {"type": "number", "default": 0.0},
            },
            "required": ["specialty"],
        },
    ),
    ToolSpec(
        name="get_doctor_availability",
        description=(
            "Return open slots for a doctor over the next N days. Always "
            "call this before suggesting a specific time."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "doctor_id": {"type": "string"},
                "days_ahead": {"type": "integer", "default": 14},
            },
            "required": ["doctor_id"],
        },
    ),
    ToolSpec(
        name="list_my_bookings",
        description=(
            "Return the patient's current and upcoming bookings. Use this "
            "when the user asks 'what's on my calendar' or 'do I have anything "
            "scheduled this week'."
        ),
        input_schema={"type": "object", "properties": {}, "required": []},
    ),
    ToolSpec(
        name="create_booking",
        description=(
            "Book an appointment. **Only call this after the user has "
            "explicitly confirmed the date, time, and provider.** Creating a "
            "booking is irreversible from the agent's side — the user must "
            "cancel through cancel_booking if they change their mind."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "provider_type": {"type": "string", "enum": ["doctor", "nurse", "hospital"]},
                "provider_id": {"type": "string"},
                "slot_start": {"type": "string", "description": "ISO 8601 start time"},
                "notes": {"type": "string", "description": "Optional reason for visit / patient notes"},
            },
            "required": ["provider_type", "provider_id", "slot_start"],
        },
    ),
    ToolSpec(
        name="cancel_booking",
        description=(
            "Cancel an existing booking. **Only call this after the user "
            "explicitly confirms cancellation.** The user may need to pay "
            "a late-cancellation fee depending on the provider's policy."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "booking_id": {"type": "string"},
                "reason": {"type": "string", "description": "Optional cancellation reason"},
            },
            "required": ["booking_id"],
        },
    ),
    ToolSpec(
        name="process_payment",
        description=(
            "Initiate payment for a booking. **Currently a stub — returns "
            "`{\"available\": false}` because the payment integration is "
            "still being hardened.** Tell the user to complete payment in "
            "the app's payment screen after the booking is created."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "booking_id": {"type": "string"},
                "amount_minor": {
                    "type": "integer",
                    "description": "Amount in the smallest currency unit (e.g. kobo, cents)",
                },
                "currency": {"type": "string", "default": "GHS"},
            },
            "required": ["booking_id"],
        },
    ),
]


def make_executor(patient_id: str):
    def execute(name: str, args: dict[str, Any]) -> str:
        if name == "search_providers":
            return _search_providers(patient_id, args)
        if name == "get_doctor_availability":
            return _get_doctor_availability(patient_id, args)
        if name == "list_my_bookings":
            return _list_my_bookings(patient_id)
        if name == "create_booking":
            return _create_booking(patient_id, args)
        if name == "cancel_booking":
            return _cancel_booking(patient_id, args)
        if name == "process_payment":
            return _process_payment_stub(args)
        return json.dumps({"error": f"unknown tool {name}"})

    return execute


def _search_providers(patient_id: str, args: dict[str, Any]) -> str:
    try:
        r = _client.get(
            f"{settings.doctor_service_url}/doctors",
            params={k: v for k, v in args.items() if v is not None},
            headers=_hdr(patient_id),
        )
    except httpx.HTTPError as e:
        return json.dumps({"error": str(e)})
    if r.status_code >= 400:
        return json.dumps({"error": r.text, "status": r.status_code})
    return json.dumps(r.json())


def _get_doctor_availability(patient_id: str, args: dict[str, Any]) -> str:
    doctor_id = args["doctor_id"]
    try:
        r = _client.get(
            f"{settings.doctor_service_url}/doctors/{doctor_id}/availability",
            params={"days_ahead": args.get("days_ahead", 14)},
            headers=_hdr(patient_id),
        )
    except httpx.HTTPError as e:
        return json.dumps({"error": str(e)})
    if r.status_code >= 400:
        return json.dumps({"error": r.text, "status": r.status_code})
    return json.dumps(r.json())


def _list_my_bookings(patient_id: str) -> str:
    try:
        r = _client.get(
            f"{settings.booking_service_url}/bookings",
            headers=_hdr(patient_id),
        )
    except httpx.HTTPError as e:
        return json.dumps({"error": str(e)})
    if r.status_code >= 400:
        return json.dumps({"error": r.text, "status": r.status_code})
    return json.dumps(r.json())


def _create_booking(patient_id: str, args: dict[str, Any]) -> str:
    try:
        r = _client.post(
            f"{settings.booking_service_url}/bookings",
            json=args,
            headers=_hdr(patient_id),
        )
    except httpx.HTTPError as e:
        return json.dumps({"error": str(e)})
    if r.status_code >= 400:
        return json.dumps({"error": r.text, "status": r.status_code})
    return json.dumps(r.json())


def _cancel_booking(patient_id: str, args: dict[str, Any]) -> str:
    booking_id = args["booking_id"]
    body = {k: v for k, v in args.items() if k != "booking_id" and v is not None}
    try:
        r = _client.post(
            f"{settings.booking_service_url}/bookings/{booking_id}/cancel",
            json=body,
            headers=_hdr(patient_id),
        )
    except httpx.HTTPError as e:
        return json.dumps({"error": str(e)})
    if r.status_code >= 400:
        return json.dumps({"error": r.text, "status": r.status_code})
    return json.dumps(r.json())


def _process_payment_stub(args: dict[str, Any]) -> str:
    """Stub. See module docstring.

    TODO: wire to payment_service once Stripe webhook signing is hardened
    (audit finding — currently uses change-me secret).
    """
    return json.dumps(
        {
            "available": False,
            "booking_id": args.get("booking_id"),
            "advice": (
                "Payment flow is not wired through the agent yet. Please "
                "complete payment in the app's payment screen after the "
                "booking is created."
            ),
        }
    )
