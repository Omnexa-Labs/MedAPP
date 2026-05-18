from __future__ import annotations

import sys
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.dialects import sqlite
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

TEST_ROOT = Path(__file__).resolve().parent
SERVICE_ROOT = TEST_ROOT.parent
BACKEND_ROOT = SERVICE_ROOT.parent.parent
SHARED_ROOT = BACKEND_ROOT / "shared"

for path in (SERVICE_ROOT, SHARED_ROOT):
    value = str(path)
    if value not in sys.path:
        sys.path.insert(0, value)

from app.deps import get_current_principal, get_db  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import Base  # noqa: E402


@compiles(PGUUID, "sqlite")
def _compile_uuid_sqlite(element, compiler, **kw):  # noqa: ARG001
    return "CHAR(36)"


sqlite.dialect.ischema_names["UUID"] = PGUUID


@pytest_asyncio.fixture
async def sessionmaker() -> async_sessionmaker:
    engine: AsyncEngine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.fixture()
def principal_patient():
    return type("Principal", (), {"subject": str(uuid4()), "role": "patient"})()


@pytest.fixture()
def principal_doctor():
    return type("Principal", (), {"subject": str(uuid4()), "role": "doctor"})()


@pytest.fixture()
def principal_admin():
    return type("Principal", (), {"subject": str(uuid4()), "role": "admin"})()


@pytest_asyncio.fixture
async def patient_client(sessionmaker: async_sessionmaker, principal_patient) -> AsyncIterator[AsyncClient]:
    app: FastAPI = create_app()

    async def _db_override():
        async with sessionmaker() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def _principal_override():
        return principal_patient

    app.dependency_overrides[get_db] = _db_override
    app.dependency_overrides[get_current_principal] = _principal_override

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def doctor_client(sessionmaker: async_sessionmaker, principal_doctor) -> AsyncIterator[AsyncClient]:
    app: FastAPI = create_app()

    async def _db_override():
        async with sessionmaker() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def _principal_override():
        return principal_doctor

    app.dependency_overrides[get_db] = _db_override
    app.dependency_overrides[get_current_principal] = _principal_override

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def admin_client(sessionmaker: async_sessionmaker, principal_admin) -> AsyncIterator[AsyncClient]:
    app: FastAPI = create_app()

    async def _db_override():
        async with sessionmaker() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def _principal_override():
        return principal_admin

    app.dependency_overrides[get_db] = _db_override
    app.dependency_overrides[get_current_principal] = _principal_override

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture()
def vitals_payload():
    return {
        "kind": "blood_pressure",
        "value": "120/80",
        "unit": "mmHg",
        "recorded_at": datetime.now(UTC).isoformat(),
        "note": "Resting",
    }