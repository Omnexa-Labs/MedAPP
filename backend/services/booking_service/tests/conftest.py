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


from app.deps import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402
from app.services import BookingRateLimiter  # noqa: E402
from shared.auth import Principal, get_current_principal  # noqa: E402


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


@pytest.fixture
def principal() -> Principal:
    return Principal(subject="11111111-1111-1111-1111-111111111111", role="user")


@pytest.fixture
def admin_principal() -> Principal:
    return Principal(subject="22222222-2222-2222-2222-222222222222", role="admin")


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Audit finding B-22: ``app`` is module-level so the limiter state
    leaks across tests. Wipe it before each test runs."""
    limiter = getattr(app.state, "booking_rate_limiter", None)
    if limiter is not None:
        limiter.reset()
    yield


@pytest_asyncio.fixture
async def client(session_factory, principal):
    async def _db_override():
        async with session_factory() as session:
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
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def admin_client(session_factory, admin_principal):
    async def _db_override():
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def _principal_override():
        return admin_principal

    app.dependency_overrides[get_db] = _db_override
    app.dependency_overrides[get_current_principal] = _principal_override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def tight_rate_limiter():
    """Replace app.state.booking_rate_limiter with a 2-call / 60s instance.
    Restored at teardown so other tests aren't affected."""
    original = app.state.booking_rate_limiter
    app.state.booking_rate_limiter = BookingRateLimiter(
        max_calls=2, window_seconds=60
    )
    yield app.state.booking_rate_limiter
    app.state.booking_rate_limiter = original


@pytest.fixture
def booking_window() -> tuple[datetime, datetime]:
    start = datetime.now(timezone.utc) + timedelta(days=1)
    start = start.replace(minute=0, second=0, microsecond=0)
    return start, start + timedelta(minutes=30)
