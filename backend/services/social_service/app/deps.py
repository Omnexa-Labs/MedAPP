from collections.abc import AsyncIterator

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal
from shared.auth.jwt import decode_token

from .config import settings
from .db import SessionLocal


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_current_principal(authorization: str | None = Header(default=None)) -> Principal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        claims = decode_token(token, secret=settings.jwt_secret, algorithm=settings.jwt_algorithm)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token") from exc
    return Principal(subject=str(claims["sub"]), role=str(claims["role"]))


async def get_optional_principal(authorization: str | None = Header(default=None)) -> Principal | None:
    """The caller if they presented a usable token, otherwise None.

    Exists for the FEED, which is readable without a token but now carries
    per-viewer flags (`liked_by_me`, `bookmarked_by_me`). Requiring a token
    there would be a breaking change for a route already shipped as open;
    ignoring the token would show a signed-in user their own likes as false.

    A MALFORMED or EXPIRED token returns None rather than 401. That is the
    deliberate difference from `get_current_principal`: on an anonymous-readable
    route a bad token is no worse than no token, and 401ing would take the feed
    away from a reader whose session merely lapsed. Routes that ACT on behalf of
    a user must keep using `get_current_principal`.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1]
    try:
        claims = decode_token(token, secret=settings.jwt_secret, algorithm=settings.jwt_algorithm)
    except Exception:  # noqa: BLE001 - see the docstring: never lock out a reader
        return None
    return Principal(subject=str(claims["sub"]), role=str(claims["role"]))


DbSession = Depends(get_db)
CurrentPrincipal = Depends(get_current_principal)
OptionalPrincipal = Depends(get_optional_principal)