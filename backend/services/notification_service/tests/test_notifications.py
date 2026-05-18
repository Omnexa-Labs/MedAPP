from __future__ import annotations

from uuid import UUID

import pytest

from app.models.notification import NotificationDelivery


@pytest.mark.asyncio
async def test_preferences_round_trip(client):
    response = await client.get("/v1/me/preferences")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["locale"] == "en"
    assert body["in_app_enabled"] is True


@pytest.mark.asyncio
async def test_update_preferences(client):
    response = await client.put(
        "/v1/me/preferences",
        json={"locale": "fr", "push_enabled": False, "sms_enabled": True, "email_enabled": False, "in_app_enabled": True},
    )
    assert response.status_code == 200, response.text
    assert response.json()["locale"] == "fr"
    assert response.json()["push_enabled"] is False


@pytest.mark.asyncio
async def test_send_notification_respects_opt_out(service_client, seed_preference, recipient_user_id, send_payload):
    await seed_preference()
    response = await service_client.post("/v1/notifications/send", json=send_payload)
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body) == 1
    assert body[0]["channel"] == "in_app"


@pytest.mark.asyncio
async def test_same_event_id_is_idempotent(service_client, send_payload):
    first = await service_client.post("/v1/notifications/send", json=send_payload)
    second = await service_client.post("/v1/notifications/send", json=send_payload)
    assert first.status_code == 200
    assert second.status_code == 200
    assert len(first.json()) == len(second.json()) == 2


@pytest.mark.asyncio
async def test_inbox_lists_messages(client, sessionmaker, principal_user):
    async with sessionmaker() as session:
        delivery = NotificationDelivery(
            event_id="evt-inbox-1",
            recipient_user_id=UUID(principal_user.subject),
            actor_user_id=None,
            channel="in_app",
            locale="en",
            event_type="booking.confirmed",
            title="Booking confirmed",
            body="Your booking is confirmed.",
            status="sent",
        )
        session.add(delivery)
        await session.commit()

    response = await client.get("/v1/me/inbox")
    assert response.status_code == 200, response.text
    assert len(response.json()["items"]) == 1