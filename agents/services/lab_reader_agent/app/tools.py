"""Tools for the Lab Reader agent (chat path only — /scan is not LLM-routed)."""
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
        description=(
            "Return a structured summary of the patient's medical record. "
            "Use this when the user asks 'what does my <test> mean' so you "
            "can ground your answer in their actual values."
        ),
        input_schema={"type": "object", "properties": {}, "required": []},
    ),
]


def make_executor(patient_id: str):
    def execute(name: str, args: dict[str, Any]) -> str:
        if name == "get_ehr_summary":
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
        return json.dumps({"error": f"unknown tool {name}"})

    return execute
