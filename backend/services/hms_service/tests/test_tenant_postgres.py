"""Opt-in PostgreSQL checks: HMS_TEST_POSTGRES=1 pytest tests/test_tenant_postgres.py.

Uses one disposable postgres:16 container, no host volumes, and random loopback port.
The container is always removed on fixture teardown; no existing database is used.
"""

import asyncio
import os
import subprocess
import sys
import time
from datetime import UTC, datetime
from uuid import uuid4

import psycopg
import pytest
from app import deps
from app import tenant as tenant_runtime
from app.deps import get_mgmt_db
from app.models.mgmt import HmsStaffRole, TenantRegistry
from app.routers.tenants import router
from app.schemas.tenant import TenantCreate
from app.services import tenant_provisioning as provisioning
from app.services import tenant_service
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from psycopg import sql
from shared.auth.jwt import issue_access_token
from sqlalchemy import func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


@pytest.fixture(scope="module")
def postgres():
    if os.getenv("HMS_TEST_POSTGRES") != "1":
        pytest.skip("set HMS_TEST_POSTGRES=1 to run disposable PostgreSQL validation")
    # The Linux QA launcher owns this separately provisioned disposable server.
    supplied = os.getenv("MEDAPP_TEST_POSTGRES_URL")
    if supplied:
        parsed = make_url(supplied)
        assert parsed.drivername == "postgresql" and parsed.host in {"localhost", "127.0.0.1"}
        assert parsed.database == "postgres" and parsed.username == "postgres"
        with psycopg.connect(supplied, connect_timeout=2) as connection:
            assert connection.execute("SELECT 1").fetchone() == (1,)
        yield supplied
        return
    name = "medapp-hms-qa-" + uuid4().hex[:12]
    password = uuid4().hex
    try:
        subprocess.run(
            [
                "docker",
                "run",
                "--detach",
                "--rm",
                "--name",
                name,
                "--publish",
                "127.0.0.1::5432",
                "--env",
                "POSTGRES_PASSWORD=" + password,
                "postgres:16",
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=60,
        )
        mapping = subprocess.run(
            ["docker", "port", name, "5432/tcp"],
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
        ).stdout.strip()
        assert mapping.startswith("127.0.0.1:")
        url = f"postgresql://postgres:{password}@{mapping}/postgres"
        deadline = time.monotonic() + 30
        while True:
            try:
                with psycopg.connect(url, connect_timeout=2) as connection:
                    assert connection.execute("SELECT 1").fetchone() == (1,)
                break
            except psycopg.OperationalError:
                if time.monotonic() > deadline:
                    raise RuntimeError("disposable PostgreSQL did not become ready") from None
                time.sleep(0.2)
        yield url
    finally:
        subprocess.run(
            ["docker", "rm", "--force", name], capture_output=True, text=True, timeout=30
        )


@pytest.fixture
async def management(postgres, monkeypatch):
    parsed = make_url(postgres)
    database = "qa_mgmt_" + uuid4().hex
    with psycopg.connect(postgres, autocommit=True) as connection:
        connection.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database)))
    mgmt_url = parsed.set(drivername="postgresql+asyncpg", database=database).render_as_string(
        hide_password=False
    )
    environment = os.environ.copy()
    environment["HMS_MGMT_DATABASE_URL"] = mgmt_url
    migration = await asyncio.to_thread(
        subprocess.run,
        [
            sys.executable,
            "-m",
            "alembic",
            "-c",
            str(provisioning.SERVICE_ROOT / "alembic_mgmt.ini"),
            "upgrade",
            "head",
        ],
        cwd=provisioning.SERVICE_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert migration.returncode == 0, "management migration failed"
    engine = create_async_engine(mgmt_url)
    monkeypatch.setattr(provisioning.settings, "admin_database_url_sync", postgres)
    monkeypatch.setattr(
        provisioning.settings,
        "tenant_database_url_template",
        parsed.set(drivername="postgresql+asyncpg", database="hms_{tenant_slug}").render_as_string(
            hide_password=False
        ),
    )
    try:
        yield async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()


def tenant_connection(url):
    return psycopg.connect(
        make_url(url).set(drivername="postgresql").render_as_string(hide_password=False),
        autocommit=True,
    )


async def test_actual_database_and_migrations_match_registry_and_replay_preserves_edits(
    management, postgres
):
    body = TenantCreate(hospital_id=uuid4(), hospital_name="Hospital A", slug="hospital-a")
    async with management() as db, db.begin():
        tenant = await tenant_service.provision_tenant(body, db)
    target = make_url(tenant.database_url)
    with tenant_connection(tenant.database_url) as connection:
        assert connection.execute("SELECT current_database()").fetchone()[0] == target.database
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT tablename FROM pg_tables WHERE schemaname='public'"
            )
        }
        assert {"patients", "staff_members", "invoices", "departments"} <= tables
        assert not {"hms_staff_roles", "tenant_registry"} & tables
    with psycopg.connect(postgres) as connection:
        marker = connection.execute(
            "SELECT shobj_description(oid, 'pg_database') FROM pg_database WHERE datname=%s",
            (target.database,),
        ).fetchone()
        assert marker == (f"medapp-hms:{body.hospital_id}",)
    async with management() as db, db.begin():
        saved = await db.get(TenantRegistry, body.hospital_id)
        saved.hospital_name = "Edited after setup"
        saved.config_json = {"saved": True}
    async with management() as db, db.begin():
        replay = await tenant_service.provision_tenant(body, db)
        assert replay.hospital_name == "Edited after setup" and replay.config_json == {
            "saved": True
        }


async def test_simultaneous_duplicate_provisioning_creates_one_workspace(management):
    body = TenantCreate(hospital_id=uuid4(), hospital_name="Hospital A", slug="hospital-a")

    async def deliver():
        async with management() as db, db.begin():
            tenant = await tenant_service.provision_tenant(body, db)
            return tenant.id, tenant.database_url

    results = await asyncio.gather(deliver(), deliver(), deliver())
    assert results[0] == results[1] == results[2]
    async with management() as db:
        assert await db.scalar(select(func.count()).select_from(TenantRegistry)) == 1


async def test_separate_application_role_owns_database_and_can_run_migrations(
    management, postgres, monkeypatch
):
    owner, password = "qa_owner_" + uuid4().hex, uuid4().hex
    with psycopg.connect(postgres, autocommit=True) as connection:
        connection.execute(
            sql.SQL("CREATE ROLE {} LOGIN PASSWORD {}").format(
                sql.Identifier(owner), sql.Literal(password)
            )
        )
    template = make_url(provisioning.settings.tenant_database_url_template).set(
        username=owner, password=password
    )
    monkeypatch.setattr(
        provisioning.settings,
        "tenant_database_url_template",
        template.render_as_string(hide_password=False),
    )
    body = TenantCreate(hospital_id=uuid4(), hospital_name="A", slug="a")
    async with management() as db, db.begin():
        tenant = await tenant_service.provision_tenant(body, db)
    with tenant_connection(tenant.database_url) as connection:
        assert connection.execute("SELECT current_user").fetchone() == (owner,)
        assert connection.execute("SELECT count(*) FROM patients").fetchone() == (0,)
    with psycopg.connect(postgres) as connection:
        assert connection.execute(
            "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=%s",
            (make_url(tenant.database_url).database,),
        ).fetchone() == (owner,)


async def test_competing_slug_requests_cannot_publish_two_workspaces(management, postgres):
    bodies = [
        TenantCreate(hospital_id=uuid4(), hospital_name=name, slug="same-slug")
        for name in ["A", "B"]
    ]

    async def deliver(body):
        async with management() as db, db.begin():
            return (await tenant_service.provision_tenant(body, db)).id

    results = await asyncio.gather(*(deliver(body) for body in bodies), return_exceptions=True)
    assert sum(isinstance(result, ValueError) for result in results) == 1
    with psycopg.connect(postgres) as connection:
        names = [
            make_url(provisioning.tenant_database_url(body.hospital_id)).database for body in bodies
        ]
        assert connection.execute(
            "SELECT count(*) FROM pg_database WHERE datname = ANY(%s)", (names,)
        ).fetchone() == (1,)


async def test_lost_setup_confirmation_resumes_owned_database_and_keeps_data(
    management, monkeypatch
):
    body = TenantCreate(hospital_id=uuid4(), hospital_name="Hospital A", slug="hospital-a")
    migrate = provisioning.run_tenant_migrations
    calls = []

    def fail_once(url):
        migrate(url)
        calls.append(url)
        if len(calls) == 1:
            with tenant_connection(url) as connection:
                connection.execute("CREATE TABLE qa_preserved (value integer)")
                connection.execute("INSERT INTO qa_preserved VALUES (7)")
            raise RuntimeError("lost setup confirmation")

    monkeypatch.setattr(provisioning, "run_tenant_migrations", fail_once)
    with pytest.raises(RuntimeError):
        async with management() as db, db.begin():
            await tenant_service.provision_tenant(body, db)
    async with management() as db, db.begin():
        assert await db.get(TenantRegistry, body.hospital_id) is None
        tenant = await tenant_service.provision_tenant(body, db)
    assert calls[0] == calls[1] == tenant.database_url
    with tenant_connection(tenant.database_url) as connection:
        assert connection.execute("SELECT value FROM qa_preserved").fetchone() == (7,)


async def test_unowned_existing_database_is_not_migrated_or_claimed(management, postgres):
    body = TenantCreate(hospital_id=uuid4(), hospital_name="Hospital A", slug="hospital-a")
    url = provisioning.tenant_database_url(body.hospital_id)
    with psycopg.connect(postgres, autocommit=True) as connection:
        connection.execute(
            sql.SQL("CREATE DATABASE {}").format(sql.Identifier(make_url(url).database))
        )
    with pytest.raises(RuntimeError):
        async with management() as db, db.begin():
            await tenant_service.provision_tenant(body, db)
    with tenant_connection(url) as connection:
        assert connection.execute(
            "SELECT count(*) FROM pg_tables WHERE schemaname='public'"
        ).fetchone() == (0,)
    async with management() as db:
        assert await db.get(TenantRegistry, body.hospital_id) is None


async def test_real_pools_keep_hospitals_separate_and_reject_disabled_workspace(
    management, monkeypatch
):
    monkeypatch.setattr(tenant_runtime, "MgmtSessionLocal", management)
    manager = tenant_runtime.TenantDBManager()
    tenants = []
    try:
        for slug in ["hospital-a", "hospital_a"]:
            async with management() as db, db.begin():
                tenant = await tenant_service.provision_tenant(
                    TenantCreate(hospital_id=uuid4(), hospital_name=slug, slug=slug), db
                )
                tenants.append(tenant)
            async with await manager.get_session(str(tenant.id)) as session:
                assert (
                    await session.scalar(text("SELECT current_database()"))
                    == make_url(tenant.database_url).database
                )
                await session.execute(text("CREATE TABLE qa_marker (name text)"))
                await session.execute(
                    text("INSERT INTO qa_marker (name) VALUES (:name)"), {"name": slug}
                )
                await session.commit()
        for tenant in tenants:
            async with await manager.get_session(str(tenant.id)) as session:
                assert await session.scalar(text("SELECT name FROM qa_marker")) == tenant.slug
        async with management() as db, db.begin():
            (await db.get(TenantRegistry, tenants[0].id)).is_active = False
        with pytest.raises(ValueError):
            await manager.get_session(str(tenants[0].id))
        assert str(tenants[0].id) not in manager._engines
        async with await manager.get_session(str(tenants[1].id)) as session:
            assert await session.scalar(text("SELECT name FROM qa_marker")) == tenants[1].slug
    finally:
        await manager.close_all()


async def test_concurrent_admin_removals_leave_one_current_administrator(management):
    tenant_id = uuid4()
    members = [
        HmsStaffRole(tenant_id=tenant_id, user_id=uuid4(), hms_role="hospital_admin")
        for _ in range(2)
    ]
    async with management() as db, db.begin():
        db.add(
            TenantRegistry(
                id=tenant_id,
                hospital_name="A",
                slug="a",
                database_url="postgresql://unused",
                provisioned_at=datetime.now(UTC),
            )
        )
        db.add_all(members)
    app = FastAPI()
    app.include_router(router)

    async def database():
        async with management() as db, db.begin():
            yield db

    app.dependency_overrides[get_mgmt_db] = database
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        results = await asyncio.gather(
            *(
                client.delete(
                    f"/v1/tenants/{tenant_id}/roles/{member.id}",
                    headers={
                        "Authorization": "Bearer "
                        + issue_access_token(
                            subject=str(member.user_id),
                            role="user",
                            secret=deps.settings.jwt_secret,
                        )
                    },
                )
                for member in members
            )
        )
    assert sorted(response.status_code for response in results) == [204, 409]
    async with management() as db:
        assert (
            await db.scalar(
                select(func.count())
                .select_from(HmsStaffRole)
                .where(HmsStaffRole.is_active.is_(True))
            )
            == 1
        )
