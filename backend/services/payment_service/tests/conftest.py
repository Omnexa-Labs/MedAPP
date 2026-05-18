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
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

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
from app.models.payment import Payment, PaymentStatus  # noqa: E402


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
def principal_user():
    return type("Principal", (), {"subject": str(uuid4()), "role": "user"})()


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


@pytest.fixture()
def payment_payload():
    return {
        "booking_id": str(uuid4()),
        "amount_cents": 12500,
        "currency": "USD",
        "method": "stripe",
        "idempotency_key": "idem-123",
        "description": "Consultation payment",
        "metadata": {"source": "test"},
    }


@pytest.fixture()
def succeeded_payment(sessionmaker, principal_user):
    async def _create():
        async with sessionmaker() as session:
            payment = Payment(
                user_id=UUID(principal_user.subject),
                booking_id=uuid4(),
                amount_cents=15000,
                currency="USD",
                method="stripe",
                status=PaymentStatus.SUCCEEDED,
                provider_reference=f"pi_{uuid4().hex}",
                confirmed_at=datetime.now(UTC),
            )
            session.add(payment)
            await session.commit()
            await session.refresh(payment)
            return payment

    return _create