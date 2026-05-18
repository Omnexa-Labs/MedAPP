from collections.abc import AsyncIterator

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

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


async def get_current_principal(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        claims = decode_token(token, secret=settings.jwt_secret, algorithm=settings.jwt_algorithm)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token") from exc
    return {"subject": str(claims["sub"]), "role": str(claims["role"]), "locale": str(claims.get("locale", "en"))}


DbSession = Depends(get_db)
CurrentPrincipalDep = Depends(get_current_principal)