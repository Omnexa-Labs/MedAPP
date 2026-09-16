from __future__ import annotations

import sys
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


def _is_other_service_path(value: str) -> bool:
    normalized = value.replace("\\", "/").lower()
    return (
        "/backend/services/" in normalized
        and "/backend/services/onboarding_service" not in normalized
    )


sys.path = [entry for entry in sys.path if not _is_other_service_path(entry)]

for path in (SERVICE_ROOT, SHARED_ROOT):
    value = str(path)
    if value not in sys.path:
        sys.path.insert(0, value)


@compiles(UUID, "sqlite")
def _compile_uuid_sqlite(element, compiler, **kw):
    return "CHAR(36)"


from app.deps import get_current_principal, get_db  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import Base  # noqa: E402
from app.storage import get_storage  # noqa: E402
from shared.auth import Principal  # noqa: E402


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False}
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def sessionmaker(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture
def principal_hospital_admin() -> Principal:
    return Principal(subject="11111111-1111-1111-1111-111111111111", role="hospital_admin")


@pytest.fixture
def principal_doctor() -> Principal:
    return Principal(subject="22222222-2222-2222-2222-222222222222", role="doctor")


@pytest.fixture
def principal_pharmacist() -> Principal:
    return Principal(subject="33333333-3333-3333-3333-333333333333", role="pharmacist")


@pytest.fixture
def principal_platform_admin() -> Principal:
    return Principal(subject="44444444-4444-4444-4444-444444444444", role="platform_admin")


async def _make_client(application, sessionmaker, principal, document_store):
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
    application.dependency_overrides[get_storage] = lambda: document_store
    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    application.dependency_overrides.clear()


@pytest_asyncio.fixture
async def hospital_client(sessionmaker, principal_hospital_admin, document_store):
    application = create_app()
    async for client in _make_client(
        application, sessionmaker, principal_hospital_admin, document_store
    ):
        yield client


@pytest_asyncio.fixture
async def doctor_client(sessionmaker, principal_doctor, document_store):
    application = create_app()
    async for client in _make_client(application, sessionmaker, principal_doctor, document_store):
        yield client


@pytest_asyncio.fixture
async def pharmacist_client(sessionmaker, principal_pharmacist, document_store):
    application = create_app()
    async for client in _make_client(
        application, sessionmaker, principal_pharmacist, document_store
    ):
        yield client


@pytest_asyncio.fixture
async def admin_client(sessionmaker, principal_platform_admin, document_store):
    application = create_app()
    async for client in _make_client(
        application, sessionmaker, principal_platform_admin, document_store
    ):
        yield client


class MemoryDocumentStorage:
    """Explicit test double; production has no memory or filesystem fallback."""

    def __init__(self):
        self.objects = {}
        self.writes = []
        self.reads = []
        self.fail_write = False
        self.fail_read = False

    async def write(self, key, data, content_type):
        self.writes.append((key, data, content_type))
        if self.fail_write:
            raise RuntimeError("storage offline")
        assert key not in self.objects
        self.objects[key] = data
        return "1"

    async def read(self, key, generation, maximum):
        self.reads.append((key, generation))
        if self.fail_read:
            raise RuntimeError("storage offline")
        assert generation == "1"
        return self.objects[key][: maximum + 1]


@pytest.fixture
def document_store():
    return MemoryDocumentStorage()


@pytest.fixture
def principal_patient():
    return Principal(subject="55555555-5555-5555-5555-555555555555", role="patient")


@pytest_asyncio.fixture
async def patient_client(sessionmaker, principal_patient, document_store):
    async for client in _make_client(create_app(), sessionmaker, principal_patient, document_store):
        yield client


@pytest.fixture
def hospital_team_payload():
    return {
        "partner_type": "hospital",
        "onboarding_mode": "team",
        "legal_name": "Nile Heart Hospital Ltd",
        "display_name": "Nile Heart Hospital",
        "specialty": "cardiology",
        "license_number": "HOSP-2026-UG-001",
        "registration_number": "REG-001",
        "country": "UG",
        "city": "Kampala",
        "address_line1": "12 Riverside Avenue",
        "email": "onboarding@hospital.example.com",
        "phone": "+256700000000",
        "team_members": [
            {
                "full_name": "Dr. Mary Achieng",
                "role": "medical_director",
                "title": "Medical Director",
                "specialty": "cardiology",
                "is_primary": True,
            }
        ],
    }


@pytest.fixture
def practitioner_payload():
    return {
        "partner_type": "practitioner",
        "practitioner_role": "doctor",
        "professional_first_name": "Peter",
        "professional_last_name": "Okello",
        "legal_name": "Dr. Peter Okello",
        "display_name": "Dr. Peter Okello",
        "specialty": "general practice",
        "license_number": "DOC-UG-7788",
        "country": "UG",
        "city": "Kampala",
        "email": "peter@example.com",
        "phone": "+256700000001",
    }


@pytest.fixture
def pharmacy_payload():
    return {
        "partner_type": "pharmacy",
        "legal_name": "City Care Pharmacy Ltd",
        "display_name": "City Care Pharmacy",
        "registration_number": "PHARM-00321",
        "license_number": "PHARM-LIC-321",
        "country": "UG",
        "city": "Kampala",
        "address_line1": "13 Riverside Avenue",
        "email": "pharmacy@example.com",
        "phone": "+256700000002",
    }
