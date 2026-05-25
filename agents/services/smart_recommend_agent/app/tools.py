"""Tools for the Smart Recommendation agent.

This agent has *two* execution paths:

- `/analyze` — pre-gathers context for the engines (no LLM tool-calling).
- `/chat` — Q&A about open recommendations. LLM may call these tools.

Both paths use the helpers below. The `fetch_*` helpers are async and do
the HTTP work; the `TOOLS` + `make_executor` glue exposes them to the LLM
in the standard ToolSpec shape for /chat.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from agents.shared import ToolSpec

from .config import settings

logger = logging.getLogger(__name__)


# Async client for the analyze path; sync client kept for the LLM tool
# executor (which is sync per the LLMProvider contract).
def _async_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=10.0,
        headers={"Authorization": f"Bearer {settings.service_token}"},
    )


_sync_client = httpx.Client(
    timeout=10.0,
    headers={"Authorization": f"Bearer {settings.service_token}"},
)


def _hdr(patient_id: str) -> dict[str, str]:
    return {"X-Patient-Id": patient_id}


# ── Async helpers used by the /analyze path ──────────────────────────────────


async def fetch_ehr_summary(patient_id: str) -> dict[str, Any]:
    """Returns the patient summary dict, or {} on any failure."""
    try:
        async with _async_client() as c:
            r = await c.get(
                f"{settings.ehr_service_url}/records/{patient_id}/summary",
                headers=_hdr(patient_id),
            )
    except httpx.HTTPError:
        logger.exception("smart_recommend.fetch_summary_failed")
        return {}
    if r.status_code >= 400:
        logger.warning("smart_recommend.fetch_summary_non_ok status=%s", r.status_code)
        return {}
    try:
        return r.json() or {}
    except ValueError:
        return {}


async def fetch_vitals(
    patient_id: str, *, days_back: int = 180
) -> list[dict[str, Any]]:
    """Returns the vitals timeline as a list of dicts, or [] on failure."""
    try:
        async with _async_client() as c:
            r = await c.get(
                f"{settings.ehr_service_url}/records/{patient_id}/vitals",
                params={"days_back": days_back},
                headers=_hdr(patient_id),
            )
    except httpx.HTTPError:
        logger.exception("smart_recommend.fetch_vitals_failed")
        return []
    if r.status_code >= 400:
        logger.warning("smart_recommend.fetch_vitals_non_ok status=%s", r.status_code)
        return []
    try:
        data = r.json()
    except ValueError:
        return []
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get("items"), list):
        return data["items"]
    return []


# ── LLM tool specs used by the /chat path ────────────────────────────────────


TOOLS: list[ToolSpec] = [
    ToolSpec(
        name="get_open_recommendations",
        description=(
            "Return the patient's recent open recommendations (status='proposed'). "
            "Use this when the user asks what the agent has suggested, or "
            "wants a recap of nudges they haven't acted on."
        ),
        input_schema={"type": "object", "properties": {}, "required": []},
    ),
    ToolSpec(
        name="get_ehr_summary",
        description="Return a structured summary of the patient's medical record.",
        input_schema={"type": "object", "properties": {}, "required": []},
    ),
]


def make_executor(patient_id: str, *, list_open):
    """Build the sync LLM-side executor.

    `list_open` is a callable `(patient_id) -> list[Recommendation]` injected
    by the agent so this module stays free of memory imports.
    """

    def execute(name: str, args: dict[str, Any]) -> str:
        if name == "get_open_recommendations":
            try:
                recs = list_open(patient_id)
                return json.dumps(
                    [
                        {
                            "kind": r.kind,
                            "text": r.text,
                            "status": r.status,
                            "created_at": r.created_at.isoformat(),
                        }
                        for r in recs
                    ]
                )
            except Exception as e:
                return json.dumps({"error": str(e)})
        if name == "get_ehr_summary":
            try:
                r = _sync_client.get(
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
