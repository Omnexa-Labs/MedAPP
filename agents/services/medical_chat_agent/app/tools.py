"""Tools for the Medical Chat agent.

The agent's job is symptom triage and Q&A. Tools should give it just enough
clinical context to answer responsibly without going beyond what it knows.

`lookup_drug_interactions` is an **honest stub** today. No backend service
exposes drug-interaction data (verified against ehr_service, pms_service,
and lab_service routers). Returning fabricated "no interactions found" is
dangerous — instead the tool returns `{"available": false, ...}` and the
prompt instructs the agent to refer the patient to a pharmacist. The stub
becomes a real call once an interaction data source is wired (see
TODO in the executor).
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


# ── Tool specs ───────────────────────────────────────────────────────────────


TOOLS: list[ToolSpec] = [
    ToolSpec(
        name="get_ehr_summary",
        description=(
            "Return a structured summary of the patient's medical record: "
            "active conditions, current medications, allergies, and last "
            "vitals. Call this first if the question depends on the patient's "
            "specific history."
        ),
        input_schema={"type": "object", "properties": {}, "required": []},
    ),
    ToolSpec(
        name="get_medications",
        description=(
            "Return the patient's current active medications. Use this before "
            "discussing anything medication-related — side effects, missed "
            "doses, interactions. Returns a list of {name, dose, frequency}."
        ),
        input_schema={"type": "object", "properties": {}, "required": []},
    ),
    ToolSpec(
        name="get_allergies",
        description=(
            "Return the patient's documented allergies. Use this before "
            "recommending anything the patient would ingest, apply, or be "
            "exposed to. Returns a list of strings."
        ),
        input_schema={"type": "object", "properties": {}, "required": []},
    ),
    ToolSpec(
        name="lookup_drug_interactions",
        description=(
            "Check for known interactions between two or more medications. "
            "May return {\"available\": false} if the interaction database "
            "is not yet wired — in that case, defer to a pharmacist."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "medications": {
                    "type": "array",
                    "items": {"type": "string"},
                    "minItems": 2,
                    "description": "Names of medications to check together.",
                },
            },
            "required": ["medications"],
        },
    ),
    ToolSpec(
        name="find_specialist",
        description=(
            "Find doctors or hospitals matching a specialty near the "
            "patient. Use when recommending follow-up clinical care."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "specialty": {
                    "type": "string",
                    "description": "Medical specialty, e.g. cardiology, dermatology",
                },
                "lat": {"type": "number"},
                "lng": {"type": "number"},
                "radius_km": {"type": "integer", "default": 20},
            },
            "required": ["specialty"],
        },
    ),
]


# ── Executors ────────────────────────────────────────────────────────────────


def make_executor(patient_id: str):
    def execute(name: str, args: dict[str, Any]) -> str:
        if name == "get_ehr_summary":
            return _get_summary(patient_id)
        if name == "get_medications":
            return _get_field(patient_id, "active_medications")
        if name == "get_allergies":
            return _get_field(patient_id, "allergies")
        if name == "lookup_drug_interactions":
            return _lookup_interactions(args.get("medications", []))
        if name == "find_specialist":
            return _find_specialist(patient_id, args)
        return json.dumps({"error": f"unknown tool {name}"})

    return execute


def _get_summary(patient_id: str) -> str:
    try:
        r = _client.get(
            f"{settings.ehr_service_url}/records/{patient_id}/summary",
            headers=_hdr(patient_id),
        )
    except httpx.HTTPError as e:
        return json.dumps({"error": str(e)})
    if r.status_code >= 400:
        return json.dumps({"error": r.text, "status": r.status_code})
    return json.dumps(r.json())


def _get_field(patient_id: str, field: str) -> str:
    """Pull a single field out of the EHR summary — cheaper than asking the
    LLM to filter the whole bundle."""
    try:
        r = _client.get(
            f"{settings.ehr_service_url}/records/{patient_id}/summary",
            headers=_hdr(patient_id),
        )
    except httpx.HTTPError as e:
        return json.dumps({"error": str(e)})
    if r.status_code >= 400:
        return json.dumps({"error": r.text, "status": r.status_code})
    try:
        data = r.json()
    except ValueError:
        return json.dumps({"error": "non-json response from ehr_service"})
    return json.dumps({field: data.get(field, [])})


def _lookup_interactions(medications: list[str]) -> str:
    """Honest stub. See module docstring.

    TODO: when an interaction data source is available (pms_service endpoint,
    DrugBank/RxNorm integration, or a curated rule table), replace this with
    a real call.
    """
    if not medications or len(medications) < 2:
        return json.dumps(
            {
                "available": False,
                "reason": "at least two medications required",
                "advice": "Please name at least two medications to check.",
            }
        )
    return json.dumps(
        {
            "available": False,
            "checked": list(medications),
            "advice": (
                "I can't verify drug interactions from here yet. Please ask "
                "your pharmacist or doctor before combining these medications."
            ),
        }
    )


def _find_specialist(patient_id: str, args: dict[str, Any]) -> str:
    try:
        r = _client.get(
            f"{settings.doctor_service_url}/doctors",
            params={
                k: v
                for k, v in args.items()
                if k in {"specialty", "lat", "lng", "radius_km"} and v is not None
            },
            headers=_hdr(patient_id),
        )
    except httpx.HTTPError as e:
        return json.dumps({"error": str(e)})
    if r.status_code >= 400:
        return json.dumps({"error": r.text, "status": r.status_code})
    return json.dumps(r.json())
