"""Consultation mode + video room provisioning.

The room-provisioning tests deliberately do NOT mock `provision_room`. They
swap the httpx transport underneath it and assert the real outbound request —
path, body and Authorization header — because a test that mocks the boundary
cannot tell you the boundary is wrong. That is the same failure mode that let
`POST /v1/appointments` pass 595 tests.
"""

from __future__ import annotations

import json
from uuid import uuid4

import httpx
import pytest
from fastapi import status

from app.services import telemedicine


ROOM_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"


@pytest.fixture
def rooms_calls(monkeypatch):
    """Capture every request booking_service makes to telemedicine_service.

    Yields the list of captured `httpx.Request`s. The handler answers 201 with
    a RoomOut-shaped body, which is what telemedicine_service really returns.
    """
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        sent = json.loads(request.read())
        return httpx.Response(
            201,
            json={
                "room_id": ROOM_ID,
                "booking_id": sent["booking_id"],
                "room_name": f"room_{sent['booking_id'].replace('-', '')}",
                "status": "scheduled",
                "scheduled_for": sent.get("scheduled_for"),
                "ended_at": None,
                "recording_enabled": False,
                "created_by_user_id": sent["patient_id"],
            },
        )

    def _client() -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url="http://telemedicine_service:8007",
            transport=httpx.MockTransport(handler),
        )

    monkeypatch.setattr(telemedicine, "_build_client", _client)
    return calls


@pytest.fixture
def rooms_down(monkeypatch):
    """telemedicine_service is unreachable — the real failure this must survive."""
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        raise httpx.ConnectError("connection refused", request=request)

    def _client() -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url="http://telemedicine_service:8007",
            transport=httpx.MockTransport(handler),
        )

    monkeypatch.setattr(telemedicine, "_build_client", _client)
    return calls


def _payload(booking_window, **overrides) -> dict:
    start, end = booking_window
    payload = {
        "doctor_id": str(uuid4()),
        "starts_at": start.isoformat(),
        "ends_at": end.isoformat(),
    }
    payload.update(overrides)
    return payload


async def test_mode_defaults_to_in_person_when_omitted(client, booking_window, rooms_calls) -> None:
    resp = await client.post("/v1/bookings", json=_payload(booking_window))
    assert resp.status_code == status.HTTP_201_CREATED
    assert resp.json()["mode"] == "in_person"
    assert resp.json()["room_id"] is None
    assert rooms_calls == []


async def test_in_person_mode_round_trips(client, booking_window, rooms_calls) -> None:
    resp = await client.post("/v1/bookings", json=_payload(booking_window, mode="in_person"))
    assert resp.status_code == status.HTTP_201_CREATED
    booking_id = resp.json()["booking_id"]
    assert resp.json()["mode"] == "in_person"

    read = await client.get(f"/v1/bookings/{booking_id}")
    assert read.json()["mode"] == "in_person"

    listed = await client.get("/v1/bookings")
    assert [item["mode"] for item in listed.json()["items"]] == ["in_person"]


async def test_in_person_booking_never_calls_telemedicine(client, booking_window, rooms_calls) -> None:
    resp = await client.post("/v1/bookings", json=_payload(booking_window, mode="in_person"))
    assert resp.status_code == status.HTTP_201_CREATED
    # The assertion that matters: zero outbound requests, not "the room_id
    # happened to be null".
    assert rooms_calls == []
    assert resp.json()["room_id"] is None


async def test_unknown_mode_is_rejected(client, booking_window, rooms_calls) -> None:
    resp = await client.post("/v1/bookings", json=_payload(booking_window, mode="telehealth"))
    # Numeric literal: FastAPI renamed the 422 constant, and this assertion
    # should not depend on which name the installed version prefers.
    assert resp.status_code == 422
    assert rooms_calls == []


async def test_video_booking_provisions_a_room(client, booking_window, rooms_calls) -> None:
    payload = _payload(booking_window, mode="video")
    resp = await client.post(
        "/v1/bookings",
        json=payload,
        headers={"Authorization": "Bearer test-token"},
    )
    assert resp.status_code == status.HTTP_201_CREATED
    body = resp.json()
    assert body["mode"] == "video"
    assert body["room_id"] == ROOM_ID

    # One outbound call, and it is the real contract: path, body, auth.
    assert len(rooms_calls) == 1
    request = rooms_calls[0]
    assert request.method == "POST"
    assert request.url.path == "/v1/rooms"
    assert request.headers["Authorization"] == "Bearer test-token"

    sent = json.loads(request.read())
    assert sent["booking_id"] == body["booking_id"]
    assert sent["patient_id"] == body["user_id"]
    assert sent["doctor_id"] == payload["doctor_id"]
    assert sent["scheduled_for"] is not None
    assert sent["recording_enabled"] is False
    # RoomCreate has no `join_url` and neither do we.
    assert "join_url" not in sent

    read = await client.get(f"/v1/bookings/{body['booking_id']}")
    assert read.json()["room_id"] == ROOM_ID


async def test_video_booking_survives_a_failed_room_call(client, booking_window, rooms_down) -> None:
    """The contract: the booking is never lost to a telemedicine outage."""
    resp = await client.post(
        "/v1/bookings",
        json=_payload(booking_window, mode="video"),
        headers={"Authorization": "Bearer test-token"},
    )
    assert resp.status_code == status.HTTP_201_CREATED
    body = resp.json()
    assert body["mode"] == "video"
    assert body["room_id"] is None
    assert body["status"] == "booked"
    assert len(rooms_down) == 1

    # And it is persisted, not just echoed — "video, no room yet" is a real
    # stored state the client can render as "video link pending".
    read = await client.get(f"/v1/bookings/{body['booking_id']}")
    assert read.status_code == status.HTTP_200_OK
    assert read.json()["mode"] == "video"
    assert read.json()["room_id"] is None


async def test_video_booking_survives_an_upstream_error_status(client, booking_window, monkeypatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"detail": "service unavailable"})

    monkeypatch.setattr(
        telemedicine,
        "_build_client",
        lambda: httpx.AsyncClient(
            base_url="http://telemedicine_service:8007",
            transport=httpx.MockTransport(handler),
        ),
    )

    resp = await client.post(
        "/v1/bookings",
        json=_payload(booking_window, mode="video"),
        headers={"Authorization": "Bearer test-token"},
    )
    assert resp.status_code == status.HTTP_201_CREATED
    assert resp.json()["room_id"] is None


async def test_video_booking_rejects_a_malformed_room_response(client, booking_window, monkeypatch) -> None:
    """A 201 without a usable room_id stores nothing rather than garbage."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(201, json={"room_name": "room_x"})

    monkeypatch.setattr(
        telemedicine,
        "_build_client",
        lambda: httpx.AsyncClient(
            base_url="http://telemedicine_service:8007",
            transport=httpx.MockTransport(handler),
        ),
    )

    resp = await client.post(
        "/v1/bookings",
        json=_payload(booking_window, mode="video"),
        headers={"Authorization": "Bearer test-token"},
    )
    assert resp.status_code == status.HTTP_201_CREATED
    assert resp.json()["room_id"] is None
