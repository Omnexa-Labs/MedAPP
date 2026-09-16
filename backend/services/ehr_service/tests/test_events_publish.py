"""Tests for the `ehr.vital.recorded` producer.

We don't run RabbitMQ. `events.publish` is the wire-contract boundary
between this service and the agent layer's vitals_watcher / smart_recommend
consumers. If the call goes through with the right shape, the integration
works end-to-end in production.
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

import pytest

from app import events as events_mod
from app.models.record import PatientRecord
from app.routers import records as records_router


@pytest.fixture
def capture_publish(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []

    async def fake_publish(_app, *, event_type: str, subject: str, data: dict[str, Any]) -> None:
        calls.append({"event_type": event_type, "subject": subject, "data": data})

    monkeypatch.setattr(events_mod, "publish", fake_publish)
    monkeypatch.setattr(records_router.events, "publish", fake_publish)
    return calls


@pytest.mark.asyncio
async def test_successful_vital_write_publishes_event(
    patient_client,
    doctor_client,
    principal_patient,
    principal_doctor,
    sessionmaker,
    capture_publish,
    vitals_payload,
) -> None:
    # The doctor needs consent to write vitals for the patient.
    async with sessionmaker() as session:
        patient = PatientRecord(user_id=UUID(principal_patient.subject), display_name="P")
        session.add(patient)
        await session.commit()

    await patient_client.post(
        f"/v1/patients/{principal_patient.subject}/consents",
        json={"doctor_user_id": principal_doctor.subject, "scope": "records_and_vitals", "reason": "ok"},
    )

    # Doctor-led vital recording.
    resp = await doctor_client.post(
        f"/v1/patients/{principal_patient.subject}/vitals",
        json=vitals_payload,
    )
    assert resp.status_code == 201, resp.text
    vital = resp.json()

    assert len(capture_publish) == 1
    event = capture_publish[0]
    assert event["event_type"] == "ehr.vital.recorded"
    assert event["subject"] == principal_patient.subject
    data = event["data"]
    assert data["patient_id"] == principal_patient.subject
    assert data["vital_id"] == vital["vital_id"]
    assert data["kind"] == vitals_payload["kind"]
    assert data["value"] == vitals_payload["value"]
    assert data["unit"] == vitals_payload["unit"]
    assert "recorded_at" in data


@pytest.mark.asyncio
async def test_validation_failure_does_not_publish(
    doctor_client,
    principal_patient,
    capture_publish,
) -> None:
    """A 422 from pydantic validation must NOT publish the event.

    The publish line lives after `record_vital()` returns; if validation
    rejects the request before reaching the handler body, no event fires.
    """
    resp = await doctor_client.post(
        f"/v1/patients/{principal_patient.subject}/vitals",
        json={
            # `kind` missing — VitalCreate requires it (min_length=1).
            "value": "120",
            "recorded_at": "2026-05-22T12:00:00+00:00",
        },
    )
    assert resp.status_code == 422
    assert capture_publish == []


@pytest.mark.asyncio
async def test_events_publish_helper_swallows_failures() -> None:
    """Broker failures must not propagate — the helper's never-raises contract.

    If this contract breaks, every vital write turns 5xx the moment rabbit
    hiccups. Pin it explicitly.
    """

    class _ExplodingBus:
        async def publish(self, _event, routing_key: str | None = None) -> None:
            raise RuntimeError("amqp closed")

    fake_app = type("App", (), {"state": type("State", (), {"event_bus": _ExplodingBus()})()})()
    # Should not raise.
    await events_mod.publish(fake_app, event_type="x", subject="y", data={})


@pytest.mark.asyncio
async def test_events_publish_is_noop_when_bus_unset() -> None:
    fake_app = type("App", (), {"state": type("State", (), {"event_bus": None})()})()
    await events_mod.publish(fake_app, event_type="x", subject="y", data={})
