from __future__ import annotations

import sys
from collections.abc import AsyncIterator
from pathlib import Path
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.dialects import sqlite
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

TEST_ROOT = Path(__file__).resolve().parent
SERVICE_ROOT = TEST_ROOT.parent
BACKEND_ROOT = SERVICE_ROOT.parent.parent
SHARED_ROOT = BACKEND_ROOT / "shared"

for entry in list(sys.path):
    if "backend\\services\\" in entry and entry not in {str(SERVICE_ROOT), str(SHARED_ROOT)}:
        sys.path.remove(entry)

for path in (SHARED_ROOT, SERVICE_ROOT):
    value = str(path)
    if value in sys.path:
        sys.path.remove(value)
    sys.path.insert(0, value)

for module_name in list(sys.modules):
    if module_name == "app" or module_name.startswith("app."):
        del sys.modules[module_name]

from app.deps import get_current_principal, get_db  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import Base  # noqa: E402
from app.storage import LocalFilesystemAttachmentStorage, set_storage  # noqa: E402


@compiles(PGUUID, "sqlite")
def _compile_uuid_sqlite(element, compiler, **kwargs):  # noqa: ARG001
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
def principal_user():
    return type("Principal", (), {"subject": str(uuid4()), "role": "user"})()


@pytest.fixture()
def principal_service():
    return type("Principal", (), {"subject": str(uuid4()), "role": "service"})()


@pytest.fixture()
def principal_outsider():
    """A real, authenticated user who is a participant of NOTHING.

    This is the 403 case. It has to be a valid principal, not a missing token —
    the interesting failure is an authenticated stranger reaching another
    patient's thread, which a 401 test says nothing about.
    """
    return type("Principal", (), {"subject": str(uuid4()), "role": "user"})()


@pytest.fixture(autouse=True)
def attachment_storage(tmp_path):
    """Point attachment storage at a per-test directory.

    Autouse so no test can accidentally write into the configured
    `/app/var/attachments`. Reset to `None` afterwards so the module global
    does not leak a deleted tmp_path into the next test.
    """
    set_storage(LocalFilesystemAttachmentStorage(tmp_path / "attachments"))
    yield tmp_path / "attachments"
    set_storage(None)


@pytest_asyncio.fixture
async def client(sessionmaker: async_sessionmaker, principal_user) -> AsyncIterator[AsyncClient]:
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
        return principal_user

    app.dependency_overrides[get_db] = _db_override
    app.dependency_overrides[get_current_principal] = _principal_override

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def outsider_client(sessionmaker: async_sessionmaker, principal_outsider) -> AsyncIterator[AsyncClient]:
    """Second authenticated user, SAME database as `client`.

    Sharing the `sessionmaker` fixture is the whole point: this client sees the
    threads `client` created and must still be refused them.
    """
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
        return principal_outsider

    app.dependency_overrides[get_db] = _db_override
    app.dependency_overrides[get_current_principal] = _principal_override

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def service_client(sessionmaker: async_sessionmaker, principal_service) -> AsyncIterator[AsyncClient]:
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
        return principal_service

    app.dependency_overrides[get_db] = _db_override
    app.dependency_overrides[get_current_principal] = _principal_override

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()