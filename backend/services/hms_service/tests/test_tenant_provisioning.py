import subprocess
import threading
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from app.models.mgmt import TenantRegistry
from app.schemas.tenant import TenantCreate
from app.services import tenant_provisioning as provisioning
from app.services import tenant_service
from sqlalchemy import func, select
from sqlalchemy.engine import make_url


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(
        provisioning.settings,
        "tenant_database_url_template",
        "postgresql+asyncpg://app:p%25ss@db:5432/hms_{tenant_slug}",
    )
    monkeypatch.setattr(
        provisioning.settings,
        "admin_database_url_sync",
        "postgresql+psycopg://admin:private@db:5432/postgres",
    )


def test_database_name_comes_from_immutable_identity_and_matches_connection_target(configured):
    tenant_id = uuid4()
    target = make_url(provisioning.tenant_database_url(tenant_id))
    assert target.database == f"hms_{tenant_id.hex}"
    assert target.password == "p%ss"
    assert target.database != make_url(provisioning.tenant_database_url(uuid4())).database


@pytest.mark.parametrize(
    "template",
    [
        "postgresql+asyncpg://app:private@db/fixed",
        "postgresql+asyncpg://app:private@{tenant_slug}/hms_fixed",
        "postgresql+asyncpg://app:private@db/{tenant_slug}_{tenant_slug}",
        "postgresql+asyncpg://app:private@other/hms_{tenant_slug}",
        "postgresql+asyncpg://app:private@db:5433/hms_{tenant_slug}",
        "postgresql+asyncpg://app:private@db/hms_{tenant_slug};drop",
        "postgresql+asyncpg://app:private@db/hms_{tenant_slug}?host=other",
        "postgresql+asyncpg://app:private@db/hms_{tenant_slug}?service=other",
        "sqlite:///hms_{tenant_slug}",
    ],
)
def test_invalid_database_configuration_is_rejected_without_disclosing_credentials(
    configured, monkeypatch, template
):
    monkeypatch.setattr(provisioning.settings, "tenant_database_url_template", template)
    with pytest.raises(RuntimeError) as error:
        provisioning.tenant_database_url(uuid4())
    assert str(error.value) == "tenant database configuration is invalid"
    assert "private" not in str(error.value)


async def test_schema_failure_does_not_publish_ready_registry_and_retry_can_finish(
    configured, monkeypatch, test_session_factory
):
    request = TenantCreate(hospital_id=uuid4(), hospital_name="A", slug="hospital-a")
    main_thread = threading.get_ident()
    calls = []

    def setup(tenant_id, url):
        assert threading.get_ident() != main_thread
        calls.append((tenant_id, url))
        if len(calls) == 1:
            raise RuntimeError("tenant schema migration failed")

    monkeypatch.setattr(tenant_service, "provision_database", setup)
    async with test_session_factory() as db:
        with pytest.raises(RuntimeError):
            await tenant_service.provision_tenant(request, db)
        await db.rollback()
    async with test_session_factory() as db:
        assert await db.get(TenantRegistry, request.hospital_id) is None
        result = await tenant_service.provision_tenant(request, db)
        await db.commit()
        assert result.provisioned_at and result.is_active
        assert result.database_url == calls[0][1]
    assert calls[0] == calls[1]


@pytest.mark.parametrize("changed", ["slug", "inactive", "unfinished"])
async def test_replay_cannot_reassign_or_reactivate_existing_tenant(
    configured, monkeypatch, test_session_factory, changed
):
    request = TenantCreate(hospital_id=uuid4(), hospital_name="A", slug="hospital-a")
    async with test_session_factory() as db:
        db.add(
            TenantRegistry(
                id=request.hospital_id,
                hospital_name="Saved name",
                slug="other" if changed == "slug" else request.slug,
                database_url="postgresql://stored",
                is_active=changed != "inactive",
                provisioned_at=None if changed == "unfinished" else datetime.now(UTC),
            )
        )
        await db.commit()

    def unexpected(*args):
        raise AssertionError("a conflicting registry entry must not trigger DDL")

    monkeypatch.setattr(tenant_service, "provision_database", unexpected)
    async with test_session_factory() as db:
        with pytest.raises(ValueError):
            await tenant_service.provision_tenant(request, db)
        assert (await db.get(TenantRegistry, request.hospital_id)).hospital_name == "Saved name"


async def test_slug_collision_is_rejected_before_external_database_creation(
    configured, monkeypatch, test_session_factory
):
    calls = []
    monkeypatch.setattr(tenant_service, "provision_database", lambda *args: calls.append(args))
    async with test_session_factory() as db:
        await tenant_service.provision_tenant(
            TenantCreate(hospital_id=uuid4(), hospital_name="A", slug="same"), db
        )
        await db.commit()
    async with test_session_factory() as db:
        with pytest.raises(ValueError):
            await tenant_service.provision_tenant(
                TenantCreate(hospital_id=uuid4(), hospital_name="B", slug="same"), db
            )
        assert await db.scalar(select(func.count()).select_from(TenantRegistry)) == 1
    assert len(calls) == 1


class DatabaseConnection:
    def __init__(self, existing=None):
        self.existing = existing
        self.queries = []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def execute(self, statement, params=None):
        rendered = statement if isinstance(statement, str) else statement.as_string()
        self.queries.append((rendered, params))
        return SimpleNamespace(fetchone=lambda: self.existing)


@pytest.mark.parametrize("existing", [False, True])
def test_database_create_or_owned_retry_uses_exact_target(configured, monkeypatch, existing):
    tenant_id = uuid4()
    url = provisioning.tenant_database_url(tenant_id)
    connection = DatabaseConnection((f"medapp-hms:{tenant_id}", "app") if existing else None)
    connect_args, migrations = [], []

    def connect(dsn, **kwargs):
        connect_args.append((dsn, kwargs))
        return connection

    monkeypatch.setattr(provisioning.psycopg, "connect", connect)
    monkeypatch.setattr(provisioning, "run_tenant_migrations", lambda dsn: migrations.append(dsn))
    provisioning.provision_database(tenant_id, url)
    assert migrations == [url]
    assert connect_args[0][1] == {"autocommit": True, "connect_timeout": 10}
    assert connect_args[0][0].startswith("postgresql://")
    creates = [q for q, _ in connection.queries if q.startswith("CREATE DATABASE")]
    assert len(creates) == (0 if existing else 1)
    if not existing:
        assert creates[0] == f'CREATE DATABASE "hms_{tenant_id.hex}" OWNER "app"'
        assert any(f"medapp-hms:{tenant_id}" in q for q, _ in connection.queries)


@pytest.mark.parametrize("marker", [None, "medapp-hms:someone-else"])
def test_existing_unowned_database_is_never_adopted(configured, monkeypatch, marker):
    tenant_id = uuid4()
    connection = DatabaseConnection((marker,))
    monkeypatch.setattr(provisioning.psycopg, "connect", lambda *args, **kwargs: connection)
    migrations = []
    monkeypatch.setattr(
        provisioning, "run_tenant_migrations", lambda *args: migrations.append(args)
    )
    with pytest.raises(RuntimeError, match="administrator recovery"):
        provisioning.provision_database(tenant_id, provisioning.tenant_database_url(tenant_id))
    assert not migrations
    assert not any(q.startswith(("CREATE", "COMMENT")) for q, _ in connection.queries)


def test_driver_error_does_not_escape_through_api_error(configured, monkeypatch):
    def connect(*args, **kwargs):
        raise RuntimeError("postgresql://admin:private@db/postgres")

    monkeypatch.setattr(provisioning.psycopg, "connect", connect)
    tenant_id = uuid4()
    with pytest.raises(RuntimeError) as error:
        provisioning.provision_database(tenant_id, provisioning.tenant_database_url(tenant_id))
    assert "private" not in str(error.value)


@pytest.mark.parametrize("failure", [None, "exit", "timeout"])
def test_migrations_run_with_bounded_timeout_correct_directory_and_no_credential_argv(
    configured, monkeypatch, failure
):
    url = provisioning.tenant_database_url(uuid4())

    def run(argv, **kwargs):
        assert "private" not in " ".join(argv) and url not in argv
        assert argv[-2:] == ["-m", "app.cli.migrate_tenant"]
        assert kwargs["cwd"] == provisioning.SERVICE_ROOT
        assert kwargs["env"]["HMS_MIGRATION_DATABASE_URL"] == url
        assert kwargs["timeout"] == 120
        if failure == "timeout":
            raise subprocess.TimeoutExpired(argv, 120, stderr="private")
        return SimpleNamespace(returncode=1 if failure == "exit" else 0, stderr="private")

    monkeypatch.setattr(provisioning.subprocess, "run", run)
    if failure:
        with pytest.raises(RuntimeError, match=r"^tenant schema migration failed$"):
            provisioning.run_tenant_migrations(url)
    else:
        provisioning.run_tenant_migrations(url)


def test_actual_migration_runner_targets_only_given_tenant_database(tmp_path):
    import sqlite3

    tenant_db = tmp_path / "tenant.sqlite3"
    provisioning.run_tenant_migrations("sqlite:///" + tenant_db.as_posix())
    provisioning.run_tenant_migrations("sqlite:///" + tenant_db.as_posix())
    with sqlite3.connect(tenant_db) as db:
        tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert {"patients", "staff_members", "departments", "invoices", "alembic_version"} <= tables
        assert not {"tenant_registry", "hms_staff_roles"} & tables
        assert db.execute("SELECT version_num FROM alembic_version").fetchone() == (
            "20260520_0001",
        )
