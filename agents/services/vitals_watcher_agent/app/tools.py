"""Tools for the Vitals Watcher agent.

Stub: only `get_ehr_summary` is wired. Add more tools by mirroring the pattern
in concierge_agent/app/tools.py.
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
        name="get_ehr_summary",
        description="Return a structured summary of the patient's medical record.",
        input_schema={"type": "object", "properties": {}, "required": []},
    ),
]


def make_executor(patient_id: str):
    def execute(name: str, args: dict[str, Any]) -> str:
        if name == "get_ehr_summary":
            r = _client.get(
                f"{settings.ehr_service_url}/records/{patient_id}/summary",
                headers=_hdr(patient_id),
            )
            if r.status_code >= 400:
                return json.dumps({"error": r.text, "status": r.status_code})
            return json.dumps(r.json())
        return json.dumps({"error": f"unknown tool {name}"})
    return execute
