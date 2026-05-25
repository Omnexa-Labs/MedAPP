from collections.abc import AsyncIterator

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import get_current_principal

from .db import SessionLocal
from .services.rate_limit import BookingRateLimiter


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def get_booking_rate_limiter(request: Request) -> BookingRateLimiter:
    """Audit finding B-22: per-user limiter is attached to ``app.state`` so
    each request reuses the same in-process buckets. Tests can swap the
    instance to dial the window down to sub-second."""
    limiter = getattr(request.app.state, "booking_rate_limiter", None)
    if limiter is None:  # pragma: no cover — create_app always sets it
        raise RuntimeError("booking_rate_limiter not initialised on app.state")
    return limiter


CurrentPrincipal = Depends(get_current_principal)
DbSession = Depends(get_db)
RateLimiterDep = Depends(get_booking_rate_limiter)
