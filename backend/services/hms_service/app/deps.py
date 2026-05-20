from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from shared.auth.jwt import decode_token

from .config import settings
from .db import MgmtSessionLocal
from .tenant import tenant_context_var, tenant_db_manager

class _DevDB:
    engine = None
    session_factory = None

    @classmethod
    def get_factory(cls):
        if cls.session_factory is None:
            cls.engine = create_async_engine(settings.dev_database_url, echo=False)
            cls.session_factory = async_sessionmaker(cls.engine, expire_on_commit=False)
        return cls.session_factory


@dataclass(frozen=True)
class HmsPrincipal:
    subject: str
    role: str
    hospital_id: str
    hms_role: str | None = None


async def get_mgmt_db() -> AsyncIterator[AsyncSession]:
    if settings.dev_mode:
        factory = _DevDB.get_factory()
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
        return

    async with MgmtSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_tenant_db() -> AsyncIterator[AsyncSession]:
    if settings.dev_mode:
        factory = _DevDB.get_factory()
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
        return

    tenant_id = tenant_context_var.get()
    if tenant_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "missing tenant context")
    session = await tenant_db_manager.get_session(tenant_id)
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


async def get_hms_principal(
    authorization: str | None = Header(default=None),
) -> HmsPrincipal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        claims = decode_token(
            token, secret=settings.jwt_secret, algorithm=settings.jwt_algorithm
        )
    except Exception as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token") from exc

    hospital_id = claims.get("hospital_id")
    if not hospital_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "no hospital_id in token")

    if settings.dev_mode and claims.get("hms_role"):
        hms_role = str(claims["hms_role"])
    else:
        hms_role = await _resolve_hms_role(str(claims["sub"]), str(hospital_id))
    return HmsPrincipal(
        subject=str(claims["sub"]),
        role=str(claims.get("role", "user")),
        hospital_id=str(hospital_id),
        hms_role=hms_role,
    )


async def _resolve_hms_role(user_id: str, tenant_id: str) -> str | None:
    from .models.mgmt import HmsStaffRole

    async with MgmtSessionLocal() as session:
        stmt = select(HmsStaffRole.hms_role).where(
            HmsStaffRole.tenant_id == UUID(tenant_id),
            HmsStaffRole.user_id == UUID(user_id),
            HmsStaffRole.is_active.is_(True),
        )
        result = await session.execute(stmt)
        row = result.scalar_one_or_none()
        return row


def require_hms_roles(*allowed_roles: str):
    async def _checker(
        principal: HmsPrincipal = Depends(get_hms_principal),
    ) -> HmsPrincipal:
        if principal.hms_role not in allowed_roles:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"requires one of {allowed_roles}, got {principal.hms_role}",
            )
        return principal

    return _checker


MgmtSession = Depends(get_mgmt_db)
TenantSession = Depends(get_tenant_db)
CurrentHmsPrincipal = Depends(get_hms_principal)
