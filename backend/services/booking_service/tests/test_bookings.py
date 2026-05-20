from __future__ import annotations

from datetime import timedelta

from fastapi import status


async def test_create_and_read_booking(client, booking_window) -> None:
    start, end = booking_window
    payload = {
        "doctor_id": "33333333-3333-3333-3333-333333333333",
        "starts_at": start.isoformat(),
        "ends_at": end.isoformat(),
        "reason": "Annual checkup",
    }

    create_resp = await client.post("/v1/bookings", json=payload)
    assert create_resp.status_code == status.HTTP_201_CREATED
    created = create_resp.json()
    assert created["doctor_id"] == payload["doctor_id"]
    assert created["status"] == "booked"
    assert created["reason"] == "Annual checkup"

    booking_id = created["booking_id"]
    read_resp = await client.get(f"/v1/bookings/{booking_id}")
    assert read_resp.status_code == status.HTTP_200_OK
    assert read_resp.json()["booking_id"] == booking_id


async def test_booking_conflict_is_rejected(client, booking_window) -> None:
    start, end = booking_window
    common = {
        "doctor_id": "44444444-4444-4444-4444-444444444444",
        "starts_at": start.isoformat(),
        "ends_at": end.isoformat(),
    }
    first = await client.post("/v1/bookings", json=common)
    assert first.status_code == status.HTTP_201_CREATED

    second = await client.post(
        "/v1/bookings",
        json={
            **common,
            "starts_at": (start + timedelta(minutes=15)).isoformat(),
            "ends_at": (end + timedelta(minutes=15)).isoformat(),
        },
    )
    assert second.status_code == status.HTTP_400_BAD_REQUEST
    assert "already booked" in second.json()["detail"]


async def test_cancel_booking(client, booking_window) -> None:
    start, end = booking_window
    create_resp = await client.post(
        "/v1/bookings",
        json={
            "doctor_id": "55555555-5555-5555-5555-555555555555",
            "starts_at": start.isoformat(),
            "ends_at": end.isoformat(),
        },
    )
    booking_id = create_resp.json()["booking_id"]
    cancel_resp = await client.post(
        f"/v1/bookings/{booking_id}/cancel",
        json={"cancellation_reason": "No longer needed"},
    )
    assert cancel_resp.status_code == status.HTTP_200_OK
    assert cancel_resp.json()["status"] == "cancelled"
    assert cancel_resp.json()["cancellation_reason"] == "No longer needed"


async def test_booking_summary_is_bounded(client, booking_window) -> None:
    start, end = booking_window
    first = await client.post(
        "/v1/bookings",
        json={
            "doctor_id": "77777777-7777-7777-7777-777777777777",
            "starts_at": start.isoformat(),
            "ends_at": end.isoformat(),
            "reason": "First slot",
        },
    )
    assert first.status_code == status.HTTP_201_CREATED

    second_start = start + timedelta(hours=2)
    second_end = end + timedelta(hours=2)
    second = await client.post(
        "/v1/bookings",
        json={
            "doctor_id": "88888888-8888-8888-8888-888888888888",
            "starts_at": second_start.isoformat(),
            "ends_at": second_end.isoformat(),
            "reason": "Second slot",
        },
    )
    assert second.status_code == status.HTTP_201_CREATED

    cancelled = await client.post(
        f"/v1/bookings/{first.json()['booking_id']}/cancel",
        json={"cancellation_reason": "No longer needed"},
    )
    assert cancelled.status_code == status.HTTP_200_OK

    summary_resp = await client.get("/v1/bookings/summary")
    assert summary_resp.status_code == status.HTTP_200_OK, summary_resp.text
    body = summary_resp.json()
    assert body["total_count"] == 2
    assert body["booked_count"] == 1
    assert body["cancelled_count"] == 1
    assert len(body["upcoming_bookings"]) == 1
    assert body["upcoming_bookings"][0]["reason"] == "Second slot"


async def test_admin_can_list_all_bookings(admin_client, booking_window) -> None:
    start, end = booking_window
    await admin_client.post(
        "/v1/bookings",
        json={
            "doctor_id": "66666666-6666-6666-6666-666666666666",
            "starts_at": start.isoformat(),
            "ends_at": end.isoformat(),
        },
    )
    list_resp = await admin_client.get("/v1/bookings", params={"all_bookings": "true"})
    assert list_resp.status_code == status.HTTP_200_OK
    assert len(list_resp.json()["items"]) == 1
