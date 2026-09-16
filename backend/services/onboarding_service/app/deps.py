import re
from collections.abc import AsyncIterator
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from shared.auth import Principal
from shared.auth.jwt import decode_token
from sqlalchemy.ext.asyncio import AsyncSession

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
        claims = decode_token(
            token,
            secret=settings.jwt_secret,
            algorithm=settings.jwt_algorithm,
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
        )
        if (
            claims.get("typ") != "access"
            or type(claims.get("exp")) is not int
            or not isinstance(claims.get("sub"), str)
            or not isinstance(claims.get("role"), str)
        ):
            raise ValueError("invalid access claims")
        UUID(claims["sub"])
    except Exception as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token") from exc
    return Principal(subject=str(claims["sub"]), role=str(claims["role"]))


DbSession = Depends(get_db)
CurrentPrincipal = Depends(get_current_principal)


def expected_version(if_match: str | None = Header(default=None, alias="If-Match")) -> int:
    if if_match is None:
        raise HTTPException(428, "If-Match with the current application version is required")
    match = re.fullmatch(r'"?([1-9][0-9]{0,9})"?', if_match)
    if not match or (if_match.startswith('"') != if_match.endswith('"')):
        raise HTTPException(400, "If-Match must contain one positive application version")
    version = int(match.group(1))
    if version > 2147483647:
        raise HTTPException(400, "application version is out of range")
    return version


VersionMatch = Depends(expected_version)
