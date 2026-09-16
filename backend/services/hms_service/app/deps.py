from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from shared.auth import Principal
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import settings
from .db import MgmtSessionLocal
from .session_tokens import platform_claims, workspace_claims
from .tenant import tenant_context_var, tenant_db_manager

log = logging.getLogger(__name__)


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
        claims = workspace_claims(token)
    except Exception as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token") from exc

    hospital_id = claims.get("hospital_id")
    if not hospital_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "no hospital_id in token")

    # Audit finding B-9: in non-dev_mode the staff role MUST come from
    # the management DB. dev_auth (B-4) only mounts in dev_mode, so this
    # shortcut is bounded by the same gate that lets dev tokens exist
    # at all; we log every hit so a stray HMS_DEV_MODE=true in a real
    # env is loud rather than silent.
    if settings.dev_mode and claims.get("hms_role"):
        hms_role = str(claims["hms_role"])
        log.warning(
            "hms_principal.dev_mode_role_from_claim sub=%s hospital_id=%s role=%s",
            claims.get("sub"),
            hospital_id,
            hms_role,
        )
    else:
        hms_role = await _resolve_hms_role(str(claims["sub"]), str(hospital_id))
    return HmsPrincipal(
        subject=str(claims["sub"]),
        role=str(claims.get("role", "user")),
        hospital_id=str(hospital_id),
        hms_role=hms_role,
    )


async def _resolve_hms_role(user_id: str, tenant_id: str) -> str | None:
    from .models.mgmt import HmsStaffRole, TenantRegistry

    async with MgmtSessionLocal() as session:
        stmt = (
            select(HmsStaffRole.hms_role)
            .join(TenantRegistry, TenantRegistry.id == HmsStaffRole.tenant_id)
            .where(
                HmsStaffRole.tenant_id == UUID(tenant_id),
                HmsStaffRole.user_id == UUID(user_id),
                HmsStaffRole.is_active.is_(True),
                TenantRegistry.is_active.is_(True),
                TenantRegistry.provisioned_at.is_not(None),
            )
        )
        result = await session.execute(stmt)
        row = result.scalar_one_or_none()
        return row


async def verify_staff_membership(user_id: str, tenant_id: str) -> bool:
    """Return True iff the user has an active staff role at the tenant.

    Audit finding B-9: middleware-layer check that the JWT's hospital_id
    claim corresponds to a real staff relationship — not just a value
    the token holder asserted. Without this, a token bearer can mint
    `hospital_id=<any-tenant>` and read tenant data through any route
    that uses get_tenant_db without also depending on get_hms_principal.

    Returns False (rather than raising) on malformed UUIDs so the
    middleware can fall through without leaking a 500 to the client.
    """
    try:
        return (await _resolve_hms_role(user_id, tenant_id)) is not None
    except (ValueError, TypeError):
        return False


def require_hms_roles(*allowed_roles: str):
    async def _checker(
        principal: Annotated[HmsPrincipal, Depends(get_hms_principal)],
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


async def get_management_principal(
    authorization: str | None = Header(default=None),
) -> Principal:
    """Management uses the platform access token; membership supplies tenant rights."""
    claims = platform_claims(authorization)
    return Principal(subject=str(UUID(claims["sub"])), role=claims["role"])
