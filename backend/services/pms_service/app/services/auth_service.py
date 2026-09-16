from __future__ import annotations

from datetime import UTC, datetime, timedelta

import jwt as pyjwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models.core import Staff
from ..models.workspace import MedAppMembership, MedAppWorkspace

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _pwd.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd.verify(plain, hashed)


def issue_token(staff: Staff, *, workspace=None, parent=None) -> str:
    if (
        len(settings.jwt_secret) < 32
        or settings.jwt_secret == settings.medapp_jwt_secret.get_secret_value()
    ):
        from fastapi import HTTPException

        raise HTTPException(503, "separate PMS session credentials are required")
    now = datetime.now(tz=UTC)
    expires = int((now + timedelta(minutes=settings.access_token_ttl_minutes)).timestamp())
    if parent:
        expires = min(expires, int(parent["exp"]), int(now.timestamp()) + 300)
    payload = {
        "sub": str(staff.id),
        "email": staff.email,
        "role": staff.role,
        "pharmacy_slug": f"pharmacy-{workspace.pharmacy_id.hex}"
        if workspace
        else settings.pharmacy_slug,
        "pharmacy_id": str(workspace.pharmacy_id) if workspace else None,
        "deployment_key": workspace.deployment_key if workspace else None,
        "medapp_user_id": parent["sub"] if parent else None,
        "aud": settings.jwt_audience,
        "iss": settings.jwt_issuer,
        "typ": "pms_access",
        "iat": int(now.timestamp()),
        "exp": expires,
    }
    return pyjwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


async def authenticate(email: str, password: str, db: AsyncSession) -> Staff | None:
    row = (
        await db.execute(select(Staff).where(Staff.email == email.lower().strip()))
    ).scalar_one_or_none()
    if row is None or not row.is_active or not row.password_hash:
        return None
    if await db.scalar(select(MedAppMembership.id).where(MedAppMembership.staff_id == row.id)):
        return None
    if not verify_password(password, row.password_hash):
        return None
    return row


async def local_session(staff, db):
    workspace = await db.scalar(select(MedAppWorkspace))
    if workspace and (
        not workspace.is_active or workspace.deployment_key != settings.medapp_deployment_key
    ):
        from fastapi import HTTPException

        raise HTTPException(403, "pharmacy workspace is unavailable")
    return issue_token(staff, workspace=workspace)
