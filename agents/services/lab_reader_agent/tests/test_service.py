"""Service-level tests: /healthz, /chat, /scan — all under JWT auth.

`/scan` is the new endpoint. We monkey-patch the agent's `scan` method to
return a canned `ScanResult` so tests exercise the HTTP wiring (auth,
IDOR, validation, response shape) without needing a real vision model.
"""
from __future__ import annotations

import base64

import pytest
from fastapi.testclient import TestClient

from app.main import _agent, app
from app.parser import LabTest, ScanResult

from .conftest import auth_header


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _png_bytes(size: int = 64) -> bytes:
    """Tiny payload that looks like an image. Size in bytes (not pixels)."""
    return b"\x89PNG\r\n\x1a\n" + b"\x00" * (size - 8)


def _patch_scan(monkeypatch: pytest.MonkeyPatch, result: ScanResult | None = None) -> list[dict]:
    """Replace the agent's scan() with a fake; return its call log."""
    calls: list[dict] = []

    default = result or ScanResult(
        doc_type="lab_report",
        tests=[
            LabTest(
                name="Hemoglobin",
                value=13.2,
                unit="g/dL",
                reference_range="12.0-15.5",
                flag="normal",
            )
        ],
        summary="One value in range.",
        confidence="high",
        warnings=[],
    )

    async def fake_scan(*, image_bytes, media_type, doc_type_hint=None):
        calls.append(
            {
                "image_bytes_len": len(image_bytes),
                "media_type": media_type,
                "doc_type_hint": doc_type_hint,
            }
        )
        return default

    monkeypatch.setattr(_agent, "scan", fake_scan)
    return calls


# ── /healthz ────────────────────────────────────────────────────────────────


def test_healthz(client: TestClient) -> None:
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json()["service"] == "lab_reader_agent"


# ── /scan: happy path ───────────────────────────────────────────────────────


def test_scan_happy_path(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _patch_scan(monkeypatch)
    payload = _png_bytes(64)
    resp = client.post(
        "/scan",
        json={
            "image_b64": base64.b64encode(payload).decode("ascii"),
            "media_type": "image/png",
        },
        headers=auth_header("p1"),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["patient_id"] == "p1"
    assert body["doc_type"] == "lab_report"
    assert body["confidence"] == "high"
    assert len(body["tests"]) == 1
    assert body["tests"][0]["name"] == "Hemoglobin"
    assert calls[0]["media_type"] == "image/png"
    assert calls[0]["image_bytes_len"] == 64


def test_scan_doc_type_hint_is_forwarded(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = _patch_scan(monkeypatch)
    resp = client.post(
        "/scan",
        json={
            "image_b64": base64.b64encode(_png_bytes(32)).decode("ascii"),
            "media_type": "image/png",
            "doc_type_hint": "prescription",
        },
        headers=auth_header("p1"),
    )
    assert resp.status_code == 200
    assert calls[0]["doc_type_hint"] == "prescription"


# ── /scan: auth + IDOR ──────────────────────────────────────────────────────


def test_scan_requires_auth(client: TestClient) -> None:
    resp = client.post(
        "/scan",
        json={
            "image_b64": base64.b64encode(_png_bytes(8)).decode("ascii"),
            "media_type": "image/png",
        },
    )
    assert resp.status_code == 401


def test_scan_blocks_cross_patient(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_scan(monkeypatch)
    resp = client.post(
        "/scan",
        json={
            "patient_id": "patient-B",
            "image_b64": base64.b64encode(_png_bytes(16)).decode("ascii"),
            "media_type": "image/png",
        },
        headers=auth_header("patient-A"),
    )
    assert resp.status_code == 403


def test_scan_admin_can_scan_for_another_patient(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_scan(monkeypatch)
    resp = client.post(
        "/scan",
        json={
            "patient_id": "patient-X",
            "image_b64": base64.b64encode(_png_bytes(16)).decode("ascii"),
            "media_type": "image/png",
        },
        headers=auth_header("ops-user", role="admin"),
    )
    assert resp.status_code == 200
    assert resp.json()["patient_id"] == "patient-X"


# ── /scan: validation ───────────────────────────────────────────────────────


def test_scan_rejects_unsupported_media_type(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_scan(monkeypatch)
    resp = client.post(
        "/scan",
        json={
            "image_b64": base64.b64encode(_png_bytes(8)).decode("ascii"),
            "media_type": "application/pdf",  # not in allow-list
        },
        headers=auth_header("p1"),
    )
    assert resp.status_code == 415
    assert "media_type" in resp.json()["detail"]


def test_scan_rejects_invalid_base64(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_scan(monkeypatch)
    resp = client.post(
        "/scan",
        json={
            "image_b64": "!!!not base64 at all!!!",
            "media_type": "image/png",
        },
        headers=auth_header("p1"),
    )
    assert resp.status_code == 400


def test_scan_rejects_empty_decoded_bytes(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_scan(monkeypatch)
    resp = client.post(
        "/scan",
        json={
            "image_b64": "",
            "media_type": "image/png",
        },
        headers=auth_header("p1"),
    )
    assert resp.status_code == 400


def test_scan_rejects_oversized_image(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The agent caps decoded image size. Configured at 5MB by default."""
    _patch_scan(monkeypatch)
    huge = b"\x89PNG\r\n\x1a\n" + b"\x00" * (6 * 1024 * 1024)
    resp = client.post(
        "/scan",
        json={
            "image_b64": base64.b64encode(huge).decode("ascii"),
            "media_type": "image/png",
        },
        headers=auth_header("p1"),
    )
    assert resp.status_code == 413


# ── /chat smoke ─────────────────────────────────────────────────────────────


def test_chat_requires_auth(client: TestClient) -> None:
    resp = client.post("/chat", json={"message": "what does hemoglobin mean?"})
    assert resp.status_code == 401


def test_chat_smoke_with_valid_token(client: TestClient) -> None:
    resp = client.post(
        "/chat",
        json={"message": "what does my hemoglobin mean?"},
        headers=auth_header("p1"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "hemoglobin" in body["reply"].lower()
