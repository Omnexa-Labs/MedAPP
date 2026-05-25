from __future__ import annotations

import sys
import types
from pathlib import Path

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

SERVICE_DIR = Path(__file__).resolve().parents[1]
# tests/<file> → tests → wearable_sync_service → services → backend
# Index 1 from SERVICE_DIR walks two levels: services → backend.
BACKEND_DIR = SERVICE_DIR.parents[1]
SHARED_DIR = BACKEND_DIR / "shared"

for path in (str(SERVICE_DIR), str(SHARED_DIR)):
    if path not in sys.path:
        sys.path.insert(0, path)

for entry in list(sys.path):
    normalized = entry.replace("\\", "/")
    if normalized.startswith(str(BACKEND_DIR / "services").replace("\\", "/")) and normalized != str(SERVICE_DIR).replace("\\", "/"):
        sys.path.remove(entry)

for module_name in list(sys.modules):
    if module_name == "app" or module_name.startswith("app."):
        del sys.modules[module_name]

app_package = types.ModuleType("app")
app_package.__path__ = [str(SERVICE_DIR / "app")]
sys.modules["app"] = app_package

from app.deps import get_current_principal, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.db import Base  # noqa: E402


@pytest_asyncio.fixture
async def engine(tmp_path):
    database_path = tmp_path / "wearable_sync_test.sqlite"
    eng = create_async_engine(
        f"sqlite+aiosqlite:///{database_path}",
        connect_args={"check_same_thread": False},
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    try:
        yield eng
    finally:
        await eng.dispose()


@pytest_asyncio.fixture
async def sessionmaker(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest_asyncio.fixture
async def principal():
    return type("Principal", (), {"subject": "00000000-0000-0000-0000-000000000001", "role": "patient"})()


@pytest_asyncio.fixture
async def client(sessionmaker, principal):
    async def _db_override():
        async with sessionmaker() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def _principal_override():
        return principal

    app.dependency_overrides[get_db] = _db_override
    app.dependency_overrides[get_current_principal] = _principal_override

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c

    app.dependency_overrides.clear()