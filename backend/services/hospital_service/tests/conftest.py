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
def principal_patient() -> Principal:
    return Principal(subject="11111111-1111-1111-1111-111111111111", role="patient")


@pytest.fixture
def principal_doctor() -> Principal:
    return Principal(subject="22222222-2222-2222-2222-222222222222", role="doctor")


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
async def admin_client(sessionmaker, principal_hospital_admin):
    application = create_app()
    async for client in _make_client(application, sessionmaker, principal_hospital_admin):
        yield client


@pytest_asyncio.fixture
async def platform_admin_client(sessionmaker, principal_platform_admin):
    application = create_app()
    async for client in _make_client(application, sessionmaker, principal_platform_admin):
        yield client


@pytest_asyncio.fixture
async def patient_client(sessionmaker, principal_patient):
    application = create_app()
    async for client in _make_client(application, sessionmaker, principal_patient):
        yield client


@pytest_asyncio.fixture
async def doctor_client(sessionmaker, principal_doctor):
    application = create_app()
    async for client in _make_client(application, sessionmaker, principal_doctor):
        yield client


@pytest_asyncio.fixture
async def anonymous_client(sessionmaker):
    """A client with NO principal override — the real auth dependency runs.

    Needed because the staff roster is the first read on this router that is not
    public, and "authentication is required" is only actually tested if some
    client can arrive without a token. Every other client fixture overrides the
    dependency away, so none of them can prove it.
    """

    async def _db_override():
        async with sessionmaker() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    application = create_app()
    application.dependency_overrides[get_db] = _db_override
    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    application.dependency_overrides.clear()


@pytest.fixture
def hospital_sample():
    return {
        "name": "Nile Heart Hospital",
        "slug": "nile-heart",
        "description": "A modern multispecialty hospital.",
        "specialty": "cardiology",
        "insurance_accepted": ["NHIF", "Axa"],
        "address_line1": "12 Riverside Avenue",
        "city": "Kampala",
        "country": "UG",
        "latitude": 0.3476,
        "longitude": 32.5825,
        "website_url": "https://hospital.example.com",
        "contact_phone": "+256700000000",
        "contact_email": "hello@hospital.example.com",
        "accreditation": "JCI",
    }


@pytest.fixture
def review_time() -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=1)