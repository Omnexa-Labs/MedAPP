from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from app import deps, tenant
from app.models.mgmt import HmsStaffRole, TenantRegistry


@pytest.fixture
async def registry(test_session_factory, monkeypatch):
    row = TenantRegistry(
        hospital_name="Hospital",
        slug="hospital",
        database_url="postgresql+asyncpg://db/hospital",
        provisioned_at=datetime.now(UTC),
    )
    async with test_session_factory() as db:
        db.add(row)
        await db.flush()
        member = HmsStaffRole(tenant_id=row.id, user_id=uuid4(), hms_role="hospital_admin")
        db.add(member)
        await db.commit()
    monkeypatch.setattr(tenant, "MgmtSessionLocal", test_session_factory)
    monkeypatch.setattr(deps, "MgmtSessionLocal", test_session_factory)
    return row, member


@pytest.mark.parametrize("change", ["disabled", "unprovisioned", "removed"])
async def test_warm_engine_cannot_bypass_registry_readiness(registry, test_session_factory, change):
    row, member = registry
    manager = tenant.TenantDBManager()
    engine = AsyncMock()
    manager._engines[str(row.id)] = (engine, object())
    manager._url_cache[str(row.id)] = row.database_url
    assert await deps.verify_staff_membership(str(member.user_id), str(row.id))
    async with test_session_factory() as db:
        saved = await db.get(TenantRegistry, row.id)
        if change == "disabled":
            saved.is_active = False
        elif change == "unprovisioned":
            saved.provisioned_at = None
        else:
            await db.delete(saved)
        await db.commit()
    assert not await deps.verify_staff_membership(str(member.user_id), str(row.id))
    with pytest.raises(ValueError):
        await manager.get_session(str(row.id))
    engine.dispose.assert_awaited_once()
    assert not manager._engines and not manager._url_cache


async def test_updated_tenant_url_replaces_and_disposes_old_pool(
    registry, test_session_factory, monkeypatch
):
    row, _ = registry
    manager = tenant.TenantDBManager()
    old, new = AsyncMock(), AsyncMock()
    manager._engines[str(row.id)] = (old, object())
    manager._url_cache[str(row.id)] = row.database_url
    updated_url = "postgresql+asyncpg://db/moved"
    async with test_session_factory() as db:
        (await db.get(TenantRegistry, row.id)).database_url = updated_url
        await db.commit()
    opened = []
    monkeypatch.setattr(
        tenant, "create_async_engine", lambda url, **kwargs: (opened.append(url), new)[1]
    )
    factory = object()
    monkeypatch.setattr(tenant, "async_sessionmaker", lambda *args, **kwargs: factory)
    result = await manager._get_or_create_engine(str(row.id))
    assert result == (new, factory) and opened == [updated_url]
    old.dispose.assert_awaited_once()
    assert await manager._get_or_create_engine(str(row.id)) == result
    assert opened == [updated_url]
    await manager.close_all()
    new.dispose.assert_awaited_once()


async def test_membership_revocation_does_not_survive_next_request(registry, test_session_factory):
    row, member = registry
    assert await deps.verify_staff_membership(str(member.user_id), str(row.id))
    async with test_session_factory() as db:
        (await db.get(HmsStaffRole, member.id)).is_active = False
        await db.commit()
    assert not await deps.verify_staff_membership(str(member.user_id), str(row.id))
