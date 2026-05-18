from __future__ import annotations

from datetime import date, timedelta
from uuid import uuid4

import pytest


@pytest.mark.asyncio
async def test_ingest_and_funnel_metrics(admin_client, event_time):
    booking_id = uuid4()
    doctor_id = uuid4()
    subject_user_id = uuid4()

    events = [
        {
            "event_id": str(uuid4()),
            "event_type": "booking.created",
            "source": "booking_service",
            "subject_user_id": str(subject_user_id),
            "occurred_at": event_time.isoformat(),
            "booking_id": str(booking_id),
            "doctor_id": str(doctor_id),
            "status": "pending_payment",
        },
        {
            "event_id": str(uuid4()),
            "event_type": "payment.succeeded",
            "source": "payment_service",
            "subject_user_id": str(subject_user_id),
            "occurred_at": (event_time + timedelta(minutes=5)).isoformat(),
            "booking_id": str(booking_id),
            "doctor_id": str(doctor_id),
            "payment_id": str(uuid4()),
            "amount_cents": 4500,
            "currency": "usd",
            "status": "succeeded",
        },
        {
            "event_id": str(uuid4()),
            "event_type": "booking.confirmed",
            "source": "booking_service",
            "subject_user_id": str(subject_user_id),
            "occurred_at": (event_time + timedelta(minutes=10)).isoformat(),
            "booking_id": str(booking_id),
            "doctor_id": str(doctor_id),
            "status": "confirmed",
        },
    ]

    for event in events:
        resp = await admin_client.post("/v1/internal/events", json=event)
        assert resp.status_code == 202, resp.text

    funnel_resp = await admin_client.get("/v1/admin/metrics/funnel", params={"from": event_time.date().isoformat(), "to": event_time.date().isoformat()})
    assert funnel_resp.status_code == 200, funnel_resp.text
    payload = funnel_resp.json()
    assert payload["bookings_created"] == 1
    assert payload["payments_succeeded"] == 1
    assert payload["bookings_confirmed"] == 1
    assert payload["booking_to_payment_rate"] == 1.0
    assert payload["payment_to_confirmation_rate"] == 1.0


@pytest.mark.asyncio
async def test_retention_metrics_track_daily_activity(admin_client, event_time):
    day_one = event_time.date()
    day_two = (event_time + timedelta(days=1)).date()
    user_one = uuid4()
    user_two = uuid4()

    await admin_client.post(
        "/v1/internal/events",
        json={
            "event_id": str(uuid4()),
            "event_type": "social.post_created",
            "source": "social_service",
            "subject_user_id": str(user_one),
            "occurred_at": event_time.isoformat(),
            "status": "published",
        },
    )
    await admin_client.post(
        "/v1/internal/events",
        json={
            "event_id": str(uuid4()),
            "event_type": "booking.created",
            "source": "booking_service",
            "subject_user_id": str(user_one),
            "occurred_at": (event_time + timedelta(days=1)).isoformat(),
            "status": "pending_payment",
        },
    )
    await admin_client.post(
        "/v1/internal/events",
        json={
            "event_id": str(uuid4()),
            "event_type": "booking.created",
            "source": "booking_service",
            "subject_user_id": str(user_two),
            "occurred_at": (event_time + timedelta(days=1)).isoformat(),
            "status": "pending_payment",
        },
    )

    retention_resp = await admin_client.get(
        "/v1/admin/metrics/retention",
        params={"from": day_one.isoformat(), "to": day_two.isoformat()},
    )
    assert retention_resp.status_code == 200, retention_resp.text
    items = retention_resp.json()["items"]
    assert len(items) == 2
    assert items[0]["active_users"] == 1
    assert items[1]["active_users"] == 2


@pytest.mark.asyncio
async def test_doctor_scorecard_aggregates_events(admin_client, event_time):
    doctor_id = uuid4()
    patient_id = uuid4()

    await admin_client.post(
        "/v1/internal/events",
        json={
            "event_id": str(uuid4()),
            "event_type": "booking.created",
            "source": "booking_service",
            "subject_user_id": str(patient_id),
            "occurred_at": event_time.isoformat(),
            "booking_id": str(uuid4()),
            "doctor_id": str(doctor_id),
            "status": "pending_payment",
        },
    )
    await admin_client.post(
        "/v1/internal/events",
        json={
            "event_id": str(uuid4()),
            "event_type": "booking.confirmed",
            "source": "booking_service",
            "subject_user_id": str(patient_id),
            "occurred_at": (event_time + timedelta(minutes=5)).isoformat(),
            "booking_id": str(uuid4()),
            "doctor_id": str(doctor_id),
            "status": "confirmed",
        },
    )
    await admin_client.post(
        "/v1/internal/events",
        json={
            "event_id": str(uuid4()),
            "event_type": "payment.succeeded",
            "source": "payment_service",
            "subject_user_id": str(patient_id),
            "occurred_at": (event_time + timedelta(minutes=10)).isoformat(),
            "booking_id": str(uuid4()),
            "doctor_id": str(doctor_id),
            "payment_id": str(uuid4()),
            "amount_cents": 5500,
            "currency": "usd",
            "status": "succeeded",
        },
    )

    scorecard_resp = await admin_client.get(f"/v1/admin/doctors/{doctor_id}/scorecard")
    assert scorecard_resp.status_code == 200, scorecard_resp.text
    payload = scorecard_resp.json()
    assert payload["bookings_created"] == 1
    assert payload["bookings_confirmed"] == 1
    assert payload["payments_succeeded"] == 1
    assert payload["revenue_cents"] == 5500


@pytest.mark.asyncio
async def test_non_admin_cannot_read_metrics(platform_admin_client, event_time):
    resp = await platform_admin_client.get("/v1/admin/metrics/funnel", params={"from": event_time.date().isoformat(), "to": event_time.date().isoformat()})
    assert resp.status_code == 200