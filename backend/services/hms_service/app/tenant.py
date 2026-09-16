from __future__ import annotations

import asyncio
import contextvars
import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from .config import settings
from .db import MgmtSessionLocal

logger = logging.getLogger(__name__)

tenant_context_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "tenant_id", default=None
)


class TenantDBManager:
    def __init__(self) -> None:
        self._engines: dict[str, tuple[AsyncEngine, async_sessionmaker[AsyncSession]]] = {}
        self._url_cache: dict[str, str] = {}
        self._cache_lock = asyncio.Lock()

    async def _resolve_database_url(self, tenant_id: str) -> str:
        from .models.mgmt import TenantRegistry

        async with MgmtSessionLocal() as session:
            stmt = select(TenantRegistry).where(
                TenantRegistry.id == UUID(tenant_id),
                TenantRegistry.is_active.is_(True),
            )
            result = await session.execute(stmt)
            tenant = result.scalar_one_or_none()
            if tenant is None:
                raise ValueError(f"tenant {tenant_id} not found or inactive")
            if tenant.provisioned_at is None:
                raise ValueError(f"tenant {tenant_id} not yet provisioned")
            return tenant.database_url

    async def _get_or_create_engine(
        self, tenant_id: str
    ) -> tuple[AsyncEngine, async_sessionmaker[AsyncSession]]:
        async with self._cache_lock:
            # Connections may be pooled, but authorization cannot be cached.
            # This also prevents use of an obsolete URL after a tenant move.
            try:
                db_url = await self._resolve_database_url(tenant_id)
            except ValueError:
                await self._evict_locked(tenant_id)
                raise
            if tenant_id in self._engines and self._url_cache.get(tenant_id) == db_url:
                return self._engines[tenant_id]
            await self._evict_locked(tenant_id)
            engine = create_async_engine(
                db_url,
                pool_pre_ping=True,
                pool_size=settings.tenant_pool_size,
                max_overflow=settings.tenant_pool_max_overflow,
                pool_recycle=settings.tenant_pool_recycle,
            )
            session_factory = async_sessionmaker(engine, expire_on_commit=False)
            self._engines[tenant_id] = (engine, session_factory)
            self._url_cache[tenant_id] = db_url
            logger.info("created engine for tenant %s", tenant_id)
            return engine, session_factory

    async def get_session(self, tenant_id: str) -> AsyncSession:
        _, session_factory = await self._get_or_create_engine(tenant_id)
        return session_factory()

    async def _evict_locked(self, tenant_id: str) -> None:
        self._url_cache.pop(tenant_id, None)
        entry = self._engines.pop(tenant_id, None)
        if entry:
            await entry[0].dispose()
            logger.info("evicted engine for tenant %s", tenant_id)

    async def evict_tenant(self, tenant_id: str) -> None:
        async with self._cache_lock:
            await self._evict_locked(tenant_id)

    async def close_all(self) -> None:
        async with self._cache_lock:
            for tenant_id in list(self._engines):
                await self._evict_locked(tenant_id)


tenant_db_manager = TenantDBManager()
