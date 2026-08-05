from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
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
from app.services import doctor_directory  # noqa: E402
from shared.auth import Principal, get_current_principal  # noqa: E402

# The doctor_service profile the tests book against, and the user_service user
# that owns it. Two DIFFERENT UUIDs on purpose — the id-space mismatch is the
# thing under test, and a fixture that reused one value would pass even if the
# production code compared the wrong pair.
DOCTOR_PROFILE_ID = "d31d9e5f-0000-4000-8000-000000000001"
DOCTOR_USER_ID = "95fc6654-0000-4000-8000-000000000002"
OTHER_DOCTOR_PROFILE_ID = "d31d9e5f-0000-4000-8000-000000000003"
OTHER_DOCTOR_USER_ID = "95fc6654-0000-4000-8000-000000000004"


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


@pytest.fixture
def doctor_profile_id() -> str:
    """The doctor_service PROFILE id a patient books against."""
    return DOCTOR_PROFILE_ID


@pytest.fixture
def other_doctor_profile_id() -> str:
    return OTHER_DOCTOR_PROFILE_ID


@pytest.fixture
def doctor_user_id() -> str:
    """The user_service USER id owning `doctor_profile_id` — a different UUID."""
    return DOCTOR_USER_ID


@pytest.fixture
def doctor_principal() -> Principal:
    """A clinician. `subject` is their USER id, never their profile id."""
    return Principal(subject=DOCTOR_USER_ID, role="doctor")


@pytest.fixture
def other_doctor_principal() -> Principal:
    return Principal(subject=OTHER_DOCTOR_USER_ID, role="doctor")


@pytest.fixture
def doctor_profiles() -> dict[str, str]:
    """The stub doctor_service's directory: profile id -> owning user id.

    Empty by default, so the default in every test is "doctor_service does not
    know this profile" and `doctor_user_id` lands NULL. Tests that need the link
    populate this before creating a booking.
    """
    return {}


@pytest.fixture
def linked_doctor(doctor_profiles, doctor_profile_id, doctor_user_id) -> str:
    """Register the profile -> user link in the stub directory.

    Returns the PROFILE id, which is what a patient puts in a booking payload.
    Requesting this fixture is the test's way of saying "doctor_service is up and
    knows this profile"; omitting it is the fail-closed case.
    """
    doctor_profiles[doctor_profile_id] = doctor_user_id
    return doctor_profile_id


@pytest.fixture(autouse=True)
def doctor_service_calls(monkeypatch, doctor_profiles) -> list[httpx.Request]:
    """Autouse stub for doctor_service, via the `_build_client` seam.

    Autouse because `POST /v1/bookings` now resolves the clinician's user id,
    and a test suite that reached the real network would be both slow and
    non-hermetic. Stubbing the transport rather than `resolve_doctor_user_id`
    keeps the request itself assertable — the tests check the path and the
    forwarded Authorization header, which a mocked function could not tell you
    were wrong.
    """
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        profile_id = request.url.path.rsplit("/", 1)[-1]
        user_id = doctor_profiles.get(profile_id)
        if user_id is None:
            return httpx.Response(404, json={"detail": "doctor profile not found"})
        return httpx.Response(
            200,
            json={
                "doctor_id": profile_id,
                "user_id": user_id,
                "first_name": "Kwabena",
                "last_name": "Osei",
                "is_active": True,
            },
        )

    def _build_client() -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url="http://doctor_service:8002",
            transport=httpx.MockTransport(handler),
        )

    monkeypatch.setattr(doctor_directory, "_build_client", _build_client)
    return calls


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


@pytest_asyncio.fixture
async def client_as(session_factory):
    """Factory for a client bound to an arbitrary principal.

    Exists because the practitioner tests need TWO identities in one test — a
    patient books, a clinician reads — and the `client` / `admin_client`
    fixtures each install a `get_current_principal` override for the whole test,
    so holding two at once would leave whichever ran last in charge. Used as a
    context manager so each identity's overrides are torn down before the next
    is installed; the database outlives them all via `session_factory`.

        async with client_as(doctor_principal) as doctor:
            ...
    """

    @asynccontextmanager
    async def _make(principal):
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
        try:
            async with AsyncClient(transport=transport, base_url="http://test") as c:
                yield c
        finally:
            app.dependency_overrides.clear()

    return _make


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
