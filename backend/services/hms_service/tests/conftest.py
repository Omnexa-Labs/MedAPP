from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from shared.db import Base

import app.models  # noqa: F401 — register all models with SQLAlchemy metadata
from app.config import settings
from app.deps import get_mgmt_db, get_tenant_db, get_hms_principal, HmsPrincipal
from app.main import create_app

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture()
async def test_engine():
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture()
def test_session_factory(test_engine):
    return async_sessionmaker(test_engine, expire_on_commit=False)


@pytest.fixture()
async def test_db(test_session_factory) -> AsyncIterator[AsyncSession]:
    async with test_session_factory() as session:
        yield session


@pytest.fixture()
def admin_user_id() -> str:
    return str(uuid4())


@pytest.fixture()
def hospital_id() -> str:
    return str(uuid4())


@pytest.fixture()
def admin_token(admin_user_id, hospital_id) -> str:
    import jwt as pyjwt
    from datetime import datetime, timedelta, timezone

    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": admin_user_id,
        "role": "admin",
        "hospital_id": hospital_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=1)).timestamp()),
    }
    return pyjwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


@pytest.fixture()
def admin_principal(admin_user_id, hospital_id) -> HmsPrincipal:
    return HmsPrincipal(
        subject=admin_user_id,
        role="admin",
        hospital_id=hospital_id,
        hms_role="hospital_admin",
    )


@pytest.fixture()
async def app(test_session_factory, admin_principal) -> FastAPI:
    application = create_app()

    async def _override_mgmt_db() -> AsyncIterator[AsyncSession]:
        async with test_session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def _override_tenant_db() -> AsyncIterator[AsyncSession]:
        async with test_session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def _override_principal() -> HmsPrincipal:
        return admin_principal

    application.dependency_overrides[get_mgmt_db] = _override_mgmt_db
    application.dependency_overrides[get_tenant_db] = _override_tenant_db
    application.dependency_overrides[get_hms_principal] = _override_principal

    return application


@pytest.fixture()
async def client(app, admin_token) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"Authorization": f"Bearer {admin_token}"},
    ) as ac:
        yield ac
