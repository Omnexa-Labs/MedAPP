"""Tools for the Vitals Watcher agent.

Two contexts:

- **/chat (LLM-driven)** — the LLM may call `get_recent_anomalies` to
  answer questions like "did anything weird happen with my heart rate
  today?" The tool re-runs the detectors on demand; no persistent
  anomaly storage in this slice.
- **/event dispatcher (subscriber-driven)** — the async `fetch_vitals`
  helper pulls recent vitals from EHR. Used both by the dispatcher path
  and the on-demand /chat path.
"""
from __future__ import annotations

import json
import logging
from dataclasses import asdict
from typing import Any

import httpx

from agents.shared import ToolSpec

from .config import settings
from .detectors import detect_all, parse_reading

logger = logging.getLogger(__name__)


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


# ── Async helpers used by the dispatcher path ───────────────────────────────


async def fetch_vitals(
    patient_id: str, hours_back: int = 6
) -> list[dict[str, Any]]:
    """Pull the patient's vitals over a bounded window. [] on any failure.

    Bounded by hours rather than days — vitals_watcher is the acute lane,
    not the trend lane. A patient who hasn't synced in days has no fresh
    samples for us to alert on.
    """
    try:
        async with _async_client() as c:
            r = await c.get(
                f"{settings.ehr_service_url}/records/{patient_id}/vitals",
                params={"hours_back": hours_back},
                headers=_hdr(patient_id),
            )
    except httpx.HTTPError:
        logger.exception("vitals_watcher.fetch_failed patient=%s", patient_id)
        return []
    if r.status_code >= 400:
        logger.warning("vitals_watcher.fetch_non_ok status=%s", r.status_code)
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


# ── LLM tool specs used by the /chat path ───────────────────────────────────


TOOLS: list[ToolSpec] = [
    ToolSpec(
        name="get_recent_anomalies",
        description=(
            "Scan the patient's recent vitals (default last 6 hours) and "
            "return any readings outside the safe range. Use this when the "
            "user asks 'did anything weird happen' or 'is my heart rate ok'."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "hours_back": {
                    "type": "integer",
                    "default": 6,
                    "description": "Window to scan, in hours. Max 72.",
                },
            },
            "required": [],
        },
    ),
    ToolSpec(
        name="get_ehr_summary",
        description="Return a structured summary of the patient's medical record.",
        input_schema={"type": "object", "properties": {}, "required": []},
    ),
]


def make_executor(patient_id: str):
    def execute(name: str, args: dict[str, Any]) -> str:
        if name == "get_recent_anomalies":
            return _scan_recent_anomalies(patient_id, args)
        if name == "get_ehr_summary":
            return _get_summary(patient_id)
        return json.dumps({"error": f"unknown tool {name}"})

    return execute


def _scan_recent_anomalies(patient_id: str, args: dict[str, Any]) -> str:
    hours = args.get("hours_back", 6)
    try:
        hours = int(hours)
    except (TypeError, ValueError):
        hours = 6
    hours = max(1, min(hours, 72))
    try:
        r = _sync_client.get(
            f"{settings.ehr_service_url}/records/{patient_id}/vitals",
            params={"hours_back": hours},
            headers=_hdr(patient_id),
        )
    except httpx.HTTPError as e:
        return json.dumps({"error": str(e)})
    if r.status_code >= 400:
        return json.dumps({"error": r.text, "status": r.status_code})
    try:
        raw = r.json()
    except ValueError:
        return json.dumps({"error": "non-json response from ehr_service"})
    if isinstance(raw, dict):
        raw = raw.get("items", [])
    readings = [r for r in (parse_reading(s) for s in raw) if r is not None]
    anomalies = detect_all(readings)
    return json.dumps(
        {
            "window_hours": hours,
            "n_readings": len(readings),
            "n_anomalies": len(anomalies),
            "anomalies": [
                {**asdict(a), "recorded_at": a.recorded_at.isoformat()}
                for a in anomalies
            ],
        }
    )


def _get_summary(patient_id: str) -> str:
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
