from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
import pytest

from app.config import settings
from app.models.room import RoomMessage, RoomStatus


@pytest.mark.asyncio
async def test_create_room_and_token(client, room_payload):
    response = await client.post("/v1/rooms", json=room_payload)
    assert response.status_code == 201, response.text
    body = response.json()
    room_id = body["room_id"]
    token_response = await client.get(f"/v1/rooms/{room_id}/token")
    assert token_response.status_code == 200, token_response.text
    token_body = token_response.json()
    assert token_body["room_id"] == room_id
    assert token_body["token"]


@pytest.mark.asyncio
async def test_join_requires_valid_participant_token(client, room_payload, principal_doctor):
    created = await client.post("/v1/rooms", json=room_payload)
    room_id = created.json()["room_id"]
    token = jwt.encode(
        {
            "sub": principal_doctor.subject,
            "role": principal_doctor.role,
            "room_id": room_id,
            "iat": int(datetime.now(UTC).timestamp()),
            "exp": int((datetime.now(UTC) + timedelta(minutes=1)).timestamp()),
            "typ": "room",
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    response = await client.post(f"/v1/rooms/{room_id}/join", headers={"X-Room-Token": token})
    assert response.status_code == 200, response.text
    assert response.json()["role"] == "doctor"


@pytest.mark.asyncio
async def test_expired_room_token_rejected(client, room_payload, principal_doctor):
    created = await client.post("/v1/rooms", json=room_payload)
    room_id = created.json()["room_id"]
    token = jwt.encode(
        {
            "sub": principal_doctor.subject,
            "role": principal_doctor.role,
            "room_id": room_id,
            "iat": int(datetime.now(UTC).timestamp()) - 3600,
            "exp": int((datetime.now(UTC) - timedelta(minutes=1)).timestamp()),
            "typ": "room",
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    response = await client.post(f"/v1/rooms/{room_id}/join", headers={"X-Room-Token": token})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_leave_message_and_end_room(client, room_payload, principal_doctor):
    created = await client.post("/v1/rooms", json=room_payload)
    room_id = created.json()["room_id"]
    token = jwt.encode(
        {
            "sub": principal_doctor.subject,
            "role": principal_doctor.role,
            "room_id": room_id,
            "iat": int(datetime.now(UTC).timestamp()),
            "exp": int((datetime.now(UTC) + timedelta(minutes=1)).timestamp()),
            "typ": "room",
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    join_response = await client.post(f"/v1/rooms/{room_id}/join", headers={"X-Room-Token": token})
    assert join_response.status_code == 200

    message_response = await client.post(
        f"/v1/rooms/{room_id}/messages",
        json={"body": "Hello from doctor"},
        headers={"X-Room-Token": token},
    )
    assert message_response.status_code == 200, message_response.text

    end_response = await client.post(f"/v1/rooms/{room_id}/end", headers={"X-Room-Token": token})
    assert end_response.status_code == 200
    assert end_response.json()["status"] == RoomStatus.ENDED.value


@pytest.mark.asyncio
async def test_room_messages_listed(client, room_payload, principal_doctor):
    created = await client.post("/v1/rooms", json=room_payload)
    room_id = created.json()["room_id"]
    token = jwt.encode(
        {
            "sub": principal_doctor.subject,
            "role": principal_doctor.role,
            "room_id": room_id,
            "iat": int(datetime.now(UTC).timestamp()),
            "exp": int((datetime.now(UTC) + timedelta(minutes=1)).timestamp()),
            "typ": "room",
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    await client.post(f"/v1/rooms/{room_id}/join", headers={"X-Room-Token": token})
    await client.post(f"/v1/rooms/{room_id}/messages", json={"body": "one"}, headers={"X-Room-Token": token})
    await client.post(f"/v1/rooms/{room_id}/messages", json={"body": "two"}, headers={"X-Room-Token": token})
    response = await client.get(f"/v1/rooms/{room_id}/messages")
    assert response.status_code == 200, response.text
    assert len(response.json()) == 2