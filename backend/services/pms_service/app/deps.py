from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth.jwt import decode_token

from .config import settings
from .db import SessionLocal


@dataclass(frozen=True)
class PmsPrincipal:
    subject: str
    email: str
    role: str
    pharmacy_slug: str


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_principal(
    authorization: str | None = Header(default=None),
) -> PmsPrincipal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        claims = decode_token(
            token, secret=settings.jwt_secret, algorithm=settings.jwt_algorithm
        )
    except Exception as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token") from exc

    return PmsPrincipal(
        subject=str(claims["sub"]),
        email=str(claims.get("email", "")),
        role=str(claims.get("role", "")),
        pharmacy_slug=str(claims.get("pharmacy_slug", settings.pharmacy_slug)),
    )


def require_roles(*allowed_roles: str):
    async def _checker(principal: PmsPrincipal = Depends(get_principal)) -> PmsPrincipal:
        if principal.role not in allowed_roles:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"requires one of {allowed_roles}, got '{principal.role}'",
            )
        return principal

    return _checker


DbSession = Depends(get_db)
CurrentPrincipal = Depends(get_principal)
