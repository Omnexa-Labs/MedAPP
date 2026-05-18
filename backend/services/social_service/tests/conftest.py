from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles


TEST_ROOT = Path(__file__).resolve().parent
SERVICE_ROOT = TEST_ROOT.parent
BACKEND_ROOT = SERVICE_ROOT.parent.parent
SHARED_ROOT = BACKEND_ROOT / "shared"

for path in (SERVICE_ROOT, SHARED_ROOT):
    value = str(path)
    if value not in sys.path:
        sys.path.insert(0, value)


@compiles(UUID, "sqlite")
def _compile_uuid_sqlite(element, compiler, **kw):  # noqa: ARG001
    return "CHAR(36)"


from app.deps import get_current_principal, get_db  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import Base  # noqa: E402
from shared.auth import Principal  # noqa: E402


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False})
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def sessionmaker(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture
def principal_doctor() -> Principal:
    return Principal(subject="11111111-1111-1111-1111-111111111111", role="doctor")


@pytest.fixture
def principal_patient() -> Principal:
    return Principal(subject="22222222-2222-2222-2222-222222222222", role="patient")


@pytest.fixture
def principal_hospital_admin() -> Principal:
    return Principal(subject="33333333-3333-3333-3333-333333333333", role="hospital_admin")


@pytest.fixture
def principal_platform_admin() -> Principal:
    return Principal(subject="44444444-4444-4444-4444-444444444444", role="platform_admin")


async def _make_client(application, sessionmaker, principal):
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

    application.dependency_overrides[get_db] = _db_override
    application.dependency_overrides[get_current_principal] = _principal_override
    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    application.dependency_overrides.clear()


@pytest_asyncio.fixture
async def doctor_client(sessionmaker, principal_doctor):
    application = create_app()
    async for client in _make_client(application, sessionmaker, principal_doctor):
        yield client


@pytest_asyncio.fixture
async def patient_client(sessionmaker, principal_patient):
    application = create_app()
    async for client in _make_client(application, sessionmaker, principal_patient):
        yield client


@pytest_asyncio.fixture
async def admin_client(sessionmaker, principal_hospital_admin):
    application = create_app()
    async for client in _make_client(application, sessionmaker, principal_hospital_admin):
        yield client


@pytest_asyncio.fixture
async def platform_admin_client(sessionmaker, principal_platform_admin):
    application = create_app()
    async for client in _make_client(application, sessionmaker, principal_platform_admin):
        yield client


@pytest.fixture
def blog_payload():
    return {
        "title": "Managing diabetes in daily life",
        "body": "Hydration, regular meals, and glucose tracking improve outcomes.",
        "excerpt": "Practical advice for patients living with diabetes.",
        "tags": ["diabetes", "wellness"],
    }


@pytest.fixture
def qa_payload():
    return {"question": "Can I exercise after a lab test?", "is_anonymous": True}


@pytest.fixture
def review_time() -> datetime:
    return datetime.now(timezone.utc) - timedelta(hours=1)