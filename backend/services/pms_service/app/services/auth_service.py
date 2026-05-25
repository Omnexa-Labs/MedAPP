from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt as pyjwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models.core import Staff

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _pwd.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd.verify(plain, hashed)


def issue_token(staff: Staff) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": str(staff.id),
        "email": staff.email,
        "role": staff.role,
        "pharmacy_slug": settings.pharmacy_slug,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.access_token_ttl_minutes)).timestamp()),
    }
    return pyjwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


async def authenticate(email: str, password: str, db: AsyncSession) -> Staff | None:
    row = (
        await db.execute(select(Staff).where(Staff.email == email.lower().strip()))
    ).scalar_one_or_none()
    if row is None or not row.is_active:
        return None
    if not verify_password(password, row.password_hash):
        return None
    return row
