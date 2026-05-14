"""Tools the concierge can call.

Each tool has:
- A `ToolSpec` (name + description + JSON schema) — given to the LLM provider
- An executor function — given to `LLMProvider.run` as a callback

Executors are sync HTTP wrappers around MedApp services. The agent passes the
patient_id as an `X-Patient-Id` header so downstream services can enforce
row-level access.
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


# ── Tool specs (vendor-agnostic JSON schemas) ────────────────────────────────

TOOLS: list[ToolSpec] = [
    ToolSpec(
        name="search_providers",
        description="Find doctors, nurses, or hospitals matching a specialty near a location.",
        input_schema={
            "type": "object",
            "properties": {
                "specialty": {"type": "string", "description": "Medical specialty, e.g. cardiology"},
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
        description="Return open slots for a doctor over the next N days.",
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
        name="create_booking",
        description="Book an appointment. Returns the booking id and a payment intent.",
        input_schema={
            "type": "object",
            "properties": {
                "provider_type": {"type": "string", "enum": ["doctor", "nurse", "hospital"]},
                "provider_id": {"type": "string"},
                "slot_start": {"type": "string", "description": "ISO 8601 start time"},
                "notes": {"type": "string"},
            },
            "required": ["provider_type", "provider_id", "slot_start"],
        },
    ),
    ToolSpec(
        name="get_ehr_summary",
        description="Return a structured summary of the patient's medical record.",
        input_schema={"type": "object", "properties": {}, "required": []},
    ),
    ToolSpec(
        name="send_notification",
        description="Send the patient a push, SMS, or email notification.",
        input_schema={
            "type": "object",
            "properties": {
                "channel": {"type": "string", "enum": ["push", "sms", "email"]},
                "title": {"type": "string"},
                "body": {"type": "string"},
            },
            "required": ["channel", "title", "body"],
        },
    ),
]


# ── Executors ────────────────────────────────────────────────────────────────

def make_executor(patient_id: str):
    def execute(name: str, args: dict[str, Any]) -> str:
        if name == "search_providers":
            r = _client.get(
                f"{settings.doctor_service_url}/doctors",
                params=args,
                headers=_hdr(patient_id),
            )
        elif name == "get_doctor_availability":
            doctor_id = args["doctor_id"]
            r = _client.get(
                f"{settings.doctor_service_url}/doctors/{doctor_id}/availability",
                params={"days_ahead": args.get("days_ahead", 14)},
                headers=_hdr(patient_id),
            )
        elif name == "create_booking":
            r = _client.post(
                f"{settings.booking_service_url}/bookings",
                json=args,
                headers=_hdr(patient_id),
            )
        elif name == "get_ehr_summary":
            r = _client.get(
                f"{settings.ehr_service_url}/records/{patient_id}/summary",
                headers=_hdr(patient_id),
            )
        elif name == "send_notification":
            r = _client.post(
                f"{settings.notification_service_url}/notifications",
                json=args,
                headers=_hdr(patient_id),
            )
        else:
            return json.dumps({"error": f"unknown tool {name}"})

        if r.status_code >= 400:
            return json.dumps({"error": r.text, "status": r.status_code})
        return json.dumps(r.json())

    return execute
