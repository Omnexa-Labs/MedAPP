"""Tests for the `lab.result.created` producer.

We don't stand up RabbitMQ in unit tests. `events.publish` is the boundary
between this service's wire contract and the agent layer's consumer; if
the call goes through with the right shape, the integration with
smart_recommend_agent will work end-to-end.
"""
from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest

from app import events as events_mod
from app.routers import lab as lab_router


@pytest.fixture
def capture_publish(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []

    async def fake_publish(_app, *, event_type: str, subject: str, data: dict[str, Any]) -> None:
        calls.append({"event_type": event_type, "subject": subject, "data": data})

    monkeypatch.setattr(events_mod, "publish", fake_publish)
    monkeypatch.setattr(lab_router.events, "publish", fake_publish)
    return calls


@pytest.mark.asyncio
async def test_successful_upload_publishes_lab_result_created(
    doctor_client, patient_client, principal_patient, capture_publish, result_time
) -> None:
    order_resp = await doctor_client.post(
        "/v1/lab/orders",
        json={
            "patient_id": principal_patient.subject,
            "test_name": "Complete Blood Count",
            "priority": "routine",
        },
    )
    assert order_resp.status_code == 201
    order_id = order_resp.json()["order_id"]

    # Doctor ordering doesn't publish — we filter to upload-time events only.
    assert capture_publish == []

    upload_resp = await patient_client.post(
        "/v1/lab/results/upload",
        json={
            "lab_order_id": order_id,
            "title": "CBC result",
            "source": "patient_upload",
            "summary": "Normal range",
            "file_name": "cbc.pdf",
            "mime_type": "application/pdf",
            "storage_key": "lab-results/cbc.pdf",
            "resulted_at": result_time.isoformat(),
            "raw_text": "hemoglobin 13.5",
            "parsed_values": {"hemoglobin": "13.5 g/dL"},
        },
    )
    assert upload_resp.status_code == 201, upload_resp.text
    result_id = upload_resp.json()["result_id"]

    assert len(capture_publish) == 1
    event = capture_publish[0]
    assert event["event_type"] == "lab.result.created"
    assert event["subject"] == principal_patient.subject
    data = event["data"]
    assert data["patient_id"] == principal_patient.subject
    assert data["result_id"] == result_id
    assert data["lab_order_id"] == order_id
    assert data["title"] == "CBC result"
    assert data["source"] == "patient_upload"


@pytest.mark.asyncio
async def test_upload_without_lab_order_still_publishes(
    patient_client, principal_patient, capture_publish, result_time
) -> None:
    """patient_upload without a doctor's order — still emits the event."""
    upload_resp = await patient_client.post(
        "/v1/lab/results/upload",
        json={
            "patient_id": principal_patient.subject,
            "title": "Photo of paper result",
            "source": "patient_upload",
            "summary": "From clinic visit last week",
            "resulted_at": result_time.isoformat(),
        },
    )
    assert upload_resp.status_code == 201, upload_resp.text
    assert len(capture_publish) == 1
    assert capture_publish[0]["data"]["lab_order_id"] is None


@pytest.mark.asyncio
async def test_failed_upload_does_not_publish(
    patient_client, capture_publish
) -> None:
    """Missing both patient_id AND lab_order_id → 400, no event fires."""
    upload_resp = await patient_client.post(
        "/v1/lab/results/upload",
        json={
            "title": "orphan",
            "source": "patient_upload",
        },
    )
    # Pydantic validation error → 422
    assert upload_resp.status_code in (400, 422)
    assert capture_publish == []


@pytest.mark.asyncio
async def test_events_publish_helper_swallows_failures() -> None:
    """The helper's never-raises contract — verified directly.

    The router calls `events.publish(...)` and trusts it not to raise on
    broker failures. If that contract breaks, every upload turns into a
    5xx the moment rabbit hiccups. This test pins the contract.
    """

    class _ExplodingBus:
        async def publish(self, _event, routing_key: str | None = None) -> None:
            raise RuntimeError("amqp closed")

    fake_app = type(
        "App",
        (),
        {"state": type("State", (), {"event_bus": _ExplodingBus()})()},
    )()
    # Should not raise.
    await events_mod.publish(fake_app, event_type="x", subject="y", data={})


@pytest.mark.asyncio
async def test_events_publish_is_noop_when_bus_unset() -> None:
    """When publish_events=False, app.state.event_bus is None; publish is a no-op."""
    fake_app = type("App", (), {"state": type("State", (), {"event_bus": None})()})()
    # Should not raise. Does nothing.
    await events_mod.publish(fake_app, event_type="x", subject="y", data={})
