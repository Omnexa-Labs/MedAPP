"""Test fixtures for user_service.

Unit tests run against in-memory SQLite (aiosqlite). To make
Postgres-specific column types portable, register dialect-level compiler
overrides for JSONB and UUID on SQLite — JSONB becomes JSON, UUID becomes
CHAR(36).
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(element, compiler, **kw):  # noqa: ARG001
    return "JSON"


@compiles(UUID, "sqlite")
def _compile_uuid_sqlite(element, compiler, **kw):  # noqa: ARG001
    return "CHAR(36)"


# Import after compiler overrides so model resolution uses them.
from app.deps import get_db, get_sms_notifier  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402
from app.services import InMemoryNotifier  # noqa: E402


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def session_factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest_asyncio.fixture
async def db(session_factory) -> AsyncIterator[AsyncSession]:
    async with session_factory() as s:
        yield s


@pytest.fixture
def notifier() -> InMemoryNotifier:
    return InMemoryNotifier()


@pytest_asyncio.fixture
async def client(session_factory, notifier) -> AsyncIterator[AsyncClient]:
    async def _db_override():
        async with session_factory() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    class _SmsAdapter:
        async def send(self, *, phone: str, body: str) -> None:
            await notifier.send_sms(phone=phone, body=body)

    app.dependency_overrides[get_db] = _db_override
    app.dependency_overrides[get_sms_notifier] = lambda: _SmsAdapter()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
