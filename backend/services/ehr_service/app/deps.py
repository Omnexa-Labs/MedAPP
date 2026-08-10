from collections.abc import AsyncIterator

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth.jwt import decode_token

from .config import settings
from .db import SessionLocal
from shared.auth.principal import Principal


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_current_principal(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        claims = decode_token(token, secret=settings.jwt_secret, algorithm=settings.jwt_algorithm)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token") from exc
    # A `Principal`, NOT a dict. This returned `{"subject": ..., "role": ...}`
    # while every consumer in the service is annotated `principal: Principal`
    # and reaches for `principal.subject` / `principal.role` — so every PHI
    # route raised `AttributeError: 'dict' object has no attribute 'subject'`
    # and surfaced as a 500. FastAPI does not enforce a dependency's return
    # type, and the annotations on the callers made the code read as correct,
    # which is why it survived: the tests mock this dependency, so the shape
    # mismatch only existed against the real one.
    return Principal(subject=str(claims["sub"]), role=str(claims["role"]))


DbSession = Depends(get_db)
CurrentPrincipalDep = Depends(get_current_principal)