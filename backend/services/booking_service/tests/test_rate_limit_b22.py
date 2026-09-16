"""Audit finding B-22 regression: ``POST /v1/bookings`` must rate-limit
per-user. Without this, a malicious or buggy client can spam booking
creation to (a) hot-loop the doctor-availability query against the DB
and (b) squat slots on a doctor's calendar.

These tests pin the contract independently of the configured numbers —
the `tight_rate_limiter` fixture swaps in a 2-call / 60s limiter so
"over the limit" is observable in a couple of lines.
"""
from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

import pytest

from app.services import BookingRateLimiter

pytestmark = pytest.mark.asyncio


def _payload(booking_window) -> dict:
    start, end = booking_window
    # Distinct doctor + offset per call so conflict-checks don't 400 us
    # before we hit the rate limit.
    return {
        "doctor_id": str(uuid4()),
        "starts_at": start.isoformat(),
        "ends_at": end.isoformat(),
        "reason": "rl test",
    }


# ── Unit tests on the limiter directly ─────────────────────────────────────


async def test_limiter_allows_up_to_max_calls():
    fake_now = [0.0]
    limiter = BookingRateLimiter(
        max_calls=3, window_seconds=10, time_func=lambda: fake_now[0]
    )
    for i in range(3):
        fake_now[0] = float(i)
        await limiter.check("user-a")


async def test_limiter_raises_429_over_limit():
    from fastapi import HTTPException

    fake_now = [0.0]
    limiter = BookingRateLimiter(
        max_calls=2, window_seconds=10, time_func=lambda: fake_now[0]
    )
    await limiter.check("user-a")
    await limiter.check("user-a")
    with pytest.raises(HTTPException) as exc_info:
        await limiter.check("user-a")
    assert exc_info.value.status_code == 429
    assert "Retry-After" in exc_info.value.headers
    # Retry-After is the window's tail relative to the oldest call.
    assert int(exc_info.value.headers["Retry-After"]) >= 1


async def test_limiter_window_resets_after_expiry():
    fake_now = [0.0]
    limiter = BookingRateLimiter(
        max_calls=2, window_seconds=10, time_func=lambda: fake_now[0]
    )
    await limiter.check("user-a")
    await limiter.check("user-a")
    fake_now[0] = 11.0  # window has elapsed
    await limiter.check("user-a")


async def test_limiter_is_per_user():
    fake_now = [0.0]
    limiter = BookingRateLimiter(
        max_calls=2, window_seconds=10, time_func=lambda: fake_now[0]
    )
    await limiter.check("user-a")
    await limiter.check("user-a")
    # User B has its own bucket.
    await limiter.check("user-b")
    await limiter.check("user-b")


# ── End-to-end via the route ───────────────────────────────────────────────


async def test_create_returns_429_when_user_over_limit(
    client, tight_rate_limiter, booking_window
):
    """The exploit scenario: client bursts 3 creates in a window where 2
    are allowed. Third must 429 with a Retry-After header."""
    first = await client.post("/v1/bookings", json=_payload(booking_window))
    assert first.status_code == 201, first.text
    second = await client.post("/v1/bookings", json=_payload(booking_window))
    assert second.status_code == 201, second.text
    third = await client.post("/v1/bookings", json=_payload(booking_window))
    assert third.status_code == 429, third.text
    assert "Retry-After" in third.headers
    assert "rate limit" in third.json()["detail"].lower()


async def test_admin_bypasses_rate_limit(
    admin_client, tight_rate_limiter, booking_window
):
    """Operator workflows (bulk imports, support scripts) must not trip
    the guard. The 2-call limiter would otherwise 429 on call three."""
    for i in range(5):
        start = booking_window[0] + timedelta(hours=i)
        end = booking_window[1] + timedelta(hours=i)
        r = await admin_client.post(
            "/v1/bookings",
            json={
                "doctor_id": str(uuid4()),
                "starts_at": start.isoformat(),
                "ends_at": end.isoformat(),
            },
        )
        assert r.status_code == 201, f"call {i}: {r.text}"


async def test_rate_limit_failed_creates_still_count(
    client, tight_rate_limiter, booking_window
):
    """An attacker can't sidestep the limit by spamming invalid bodies —
    the limiter records intent, not successful creations, so the conflict
    check is shielded from hot-looping."""
    # First two calls collide on the same (doctor, time) → 400, not 201.
    payload = _payload(booking_window)
    a = await client.post("/v1/bookings", json=payload)
    assert a.status_code == 201
    b = await client.post("/v1/bookings", json=payload)  # conflict
    assert b.status_code == 409
    # Third call still 429 — the failed second one consumed a slot.
    c = await client.post("/v1/bookings", json=_payload(booking_window))
    assert c.status_code == 429
