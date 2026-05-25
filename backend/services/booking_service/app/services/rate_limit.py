"""Per-user rate limiting for booking creation (audit finding B-22).

Without this, a malicious or buggy client can spam ``POST /v1/bookings``
to (a) hot-loop the doctor-availability scan against the DB, and (b)
squat slots on a doctor's calendar even if only one booking is real
(the conflict check rejects overlaps, but a client can sweep adjacent
slots faster than legitimate users can claim them).

Implementation: in-process sliding-window counter keyed on the
authenticated principal's subject. State is per-replica, so two
booking_service replicas each enforce their own bucket. That's
deliberately weaker than a Redis-backed limiter, but symmetric with the
rest of the platform's single-replica posture today and strictly better
than zero. Swap for a shared store before scaling out.

Admins bypass the check — operator workflows (bulk imports, support
scripts) should not trip a guard aimed at end-user abuse.
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict, deque
from collections.abc import Callable
from time import monotonic

from fastapi import HTTPException, status

log = logging.getLogger(__name__)


class BookingRateLimiter:
    def __init__(
        self,
        *,
        max_calls: int,
        window_seconds: float,
        time_func: Callable[[], float] = monotonic,
    ) -> None:
        if max_calls <= 0:
            raise ValueError("max_calls must be positive")
        if window_seconds <= 0:
            raise ValueError("window_seconds must be positive")
        self.max_calls = max_calls
        self.window_seconds = float(window_seconds)
        self._time = time_func
        self._buckets: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def check(self, user_key: str) -> None:
        """Record a hit for ``user_key`` or raise 429.

        Failed downstream operations (e.g. a booking that 400s on
        conflict) still count — the rate limit governs *intent*, not
        successful creations, otherwise an attacker can hammer the
        conflict-check query for free.
        """
        async with self._lock:
            now = self._time()
            cutoff = now - self.window_seconds
            bucket = self._buckets[user_key]
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= self.max_calls:
                retry_after = max(
                    1, int(round(bucket[0] + self.window_seconds - now))
                )
                log.warning(
                    "booking.rate_limit_exceeded user=%s count=%d window=%ss",
                    user_key, len(bucket), self.window_seconds,
                )
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=(
                        "booking creation rate limit exceeded; "
                        f"retry in {retry_after}s"
                    ),
                    headers={"Retry-After": str(retry_after)},
                )
            bucket.append(now)

    def reset(self, user_key: str | None = None) -> None:
        """Clear bucket(s). Used by tests; callable in prod only via support
        tooling if a legitimate user gets stuck behind a runaway client."""
        if user_key is None:
            self._buckets.clear()
        else:
            self._buckets.pop(user_key, None)


__all__ = ["BookingRateLimiter"]
