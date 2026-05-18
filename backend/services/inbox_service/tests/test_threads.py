from __future__ import annotations

from uuid import UUID

import pytest


@pytest.mark.asyncio
async def test_create_thread_and_post_messages(client, principal_user):
    response = await client.post(
        "/v1/threads",
        json={
            "subject": "Need help with my booking",
            "participant_user_ids": [principal_user.subject],
            "participant_roles": ["user"],
            "assigned_role": "nurse",
            "source": "direct",
        },
    )
    assert response.status_code == 201, response.text
    thread_id = response.json()["thread_id"]

    message_response = await client.post(f"/v1/threads/{thread_id}/messages", json={"body": "I need a human to review this."})
    assert message_response.status_code == 200, message_response.text
    assert message_response.json()["message_id"]

    list_response = await client.get(f"/v1/threads/{thread_id}/messages")
    assert list_response.status_code == 200, list_response.text
    assert len(list_response.json()) == 1


@pytest.mark.asyncio
async def test_handoff_thread_is_visible_to_user(client, service_client, principal_user):
    created = await service_client.post(
        "/v1/threads/handoff",
        json={
            "user_id": principal_user.subject,
            "assigned_role": "doctor",
            "subject": "Escalated from chat agent",
            "summary": "Agent could not resolve the medication question and escalated to a clinician.",
            "booking_id": None,
            "locale": "en",
        },
    )
    assert created.status_code == 201, created.text
    thread_id = created.json()["thread_id"]

    inbox = await client.get("/v1/threads")
    assert inbox.status_code == 200, inbox.text
    assert inbox.json()["items"][0]["thread_id"] == thread_id


@pytest.mark.asyncio
async def test_mark_thread_read(client, principal_user):
    created = await client.post(
        "/v1/threads",
        json={
            "subject": "Read receipt check",
            "participant_user_ids": [principal_user.subject],
            "participant_roles": ["user"],
            "source": "direct",
        },
    )
    thread_id = created.json()["thread_id"]

    response = await client.post(f"/v1/threads/{thread_id}/read")
    assert response.status_code == 200, response.text
    assert response.json()["last_read_at"] is not None