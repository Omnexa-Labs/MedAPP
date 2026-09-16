from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .db import SessionLocal
from .models.core import PharmacyProfile, Staff
from .models.workspace import MedAppMembership, MedAppWorkspace


@dataclass(frozen=True)
class PmsPrincipal:
    subject: str
    email: str
    role: str
    pharmacy_slug: str
    full_name: str = ""
    expires_at: int = 0


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_principal(
    db: Annotated[AsyncSession, Depends(get_db)],
    authorization: str | None = Header(default=None),
) -> PmsPrincipal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        if (
            len(settings.jwt_secret) < 32
            or settings.jwt_secret == settings.medapp_jwt_secret.get_secret_value()
        ):
            raise ValueError()
        claims = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={"require": ["sub", "exp", "iat", "aud", "iss", "typ", "pharmacy_slug"]},
        )
        if claims["typ"] != "pms_access":
            raise ValueError()
        subject = UUID(claims["sub"])
    except (jwt.InvalidTokenError, ValueError, TypeError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token") from exc
    staff = await db.get(Staff, subject)
    if not staff or not staff.is_active:
        raise HTTPException(401, "staff session is unavailable")
    workspace = await db.scalar(select(MedAppWorkspace))
    member = await db.scalar(select(MedAppMembership).where(MedAppMembership.staff_id == subject))
    if workspace:
        profile = await db.get(PharmacyProfile, workspace.pharmacy_id)
        if (
            not workspace.is_active
            or not profile
            or workspace.deployment_key != settings.medapp_deployment_key
            or claims.get("pharmacy_id") != str(workspace.pharmacy_id)
            or claims.get("deployment_key") != workspace.deployment_key
            or claims["pharmacy_slug"] != f"pharmacy-{workspace.pharmacy_id.hex}"
        ):
            raise HTTPException(401, "pharmacy session is unavailable")
    elif (
        claims.get("pharmacy_id")
        or claims.get("deployment_key")
        or claims["pharmacy_slug"] != settings.pharmacy_slug
    ):
        raise HTTPException(401, "pharmacy session is unavailable")
    if (member or claims.get("medapp_user_id")) and (
        not workspace
        or not member
        or not member.is_active
        or member.role != staff.role
        or workspace.owner_id != member.user_id
        or claims.get("medapp_user_id") != str(member.user_id)
    ):
        raise HTTPException(401, "MedApp workspace access is unavailable")
    return PmsPrincipal(
        subject=str(staff.id),
        email=staff.email,
        role=staff.role,
        pharmacy_slug=claims["pharmacy_slug"],
        full_name=staff.full_name,
        expires_at=int(claims["exp"]),
    )


def require_roles(*allowed_roles: str):
    async def _checker(principal: Annotated[PmsPrincipal, Depends(get_principal)]) -> PmsPrincipal:
        if principal.role not in allowed_roles:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"requires one of {allowed_roles}, got '{principal.role}'",
            )
        return principal

    return _checker


DbSession = Depends(get_db)
CurrentPrincipal = Depends(get_principal)
