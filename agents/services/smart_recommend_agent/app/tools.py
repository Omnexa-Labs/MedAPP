"""Tools for the Smart Recommendations agent.

Each tool wraps an internal MedApp service. Implement the bodies as you grow
this agent’s scope; the concierge_agent has a fully fleshed-out example.
"""
from __future__ import annotations

import json

import httpx
from anthropic import beta_tool

from .config import settings

_client = httpx.Client(
    timeout=10.0,
    headers={"Authorization": f"Bearer {settings.service_token}"},
)


def _hdr(patient_id: str) -> dict[str, str]:
    return {"X-Patient-Id": patient_id}


@beta_tool
def get_ehr_summary(patient_id: str) -> str:
    """Return a structured summary of the patient’s medical record."""
    r = _client.get(
        f"{settings.ehr_service_url}/records/{patient_id}/summary",
        headers=_hdr(patient_id),
    )
    r.raise_for_status()
    return json.dumps(r.json())


ALL_TOOLS = [get_ehr_summary]
