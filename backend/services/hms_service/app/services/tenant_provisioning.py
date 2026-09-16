"""Bounded database setup. A retry may reuse only a database owned by this tenant."""

import hashlib
import os
import re
import subprocess
import sys
from pathlib import Path
from uuid import UUID

import psycopg
from psycopg import sql
from sqlalchemy.engine import make_url

from ..config import settings

SERVICE_ROOT = Path(__file__).resolve().parents[2]
SAFE_DATABASE_NAME = re.compile(r"^[a-z][a-z0-9_]{0,62}$")
CONNECTION_OVERRIDES = {"host", "hostaddr", "port", "dbname", "database", "service", "servicefile"}


def lock_key(identity: str) -> int:
    return int.from_bytes(hashlib.sha256(identity.encode()).digest()[:8], "big", signed=True)


def tenant_database_url(tenant_id: UUID) -> str:
    template = settings.tenant_database_url_template
    try:
        parsed = make_url(template)
        if (
            template.count("{tenant_slug}") != 1
            or "{tenant_slug}" not in (parsed.database or "")
            or parsed.drivername != "postgresql+asyncpg"
        ):
            raise ValueError
        # The database identity is immutable and independent of a display slug.
        # In particular, hospital-a and hospital_a must never share a database.
        target = parsed.set(database=parsed.database.replace("{tenant_slug}", tenant_id.hex))
        validate_cluster(target.render_as_string(hide_password=False))
        return target.render_as_string(hide_password=False)
    except Exception:
        raise RuntimeError("tenant database configuration is invalid") from None


def validate_cluster(database_url: str):
    target = make_url(database_url)
    admin = make_url(settings.admin_database_url_sync)
    if (
        target.get_backend_name() != "postgresql"
        or admin.get_backend_name() != "postgresql"
        or not target.host
        or not target.username
        or (target.host, target.port or 5432) != (admin.host, admin.port or 5432)
        or not SAFE_DATABASE_NAME.fullmatch(target.database or "")
        or CONNECTION_OVERRIDES.intersection(target.query)
        or CONNECTION_OVERRIDES.intersection(admin.query)
    ):
        raise ValueError("tenant and admin database configuration must identify the same cluster")
    return target, admin


def provision_database(tenant_id: UUID, database_url: str) -> None:
    """Runs on a worker thread; management transaction stays uncommitted on failure."""
    try:
        target, admin = validate_cluster(database_url)
        admin_dsn = admin.set(drivername="postgresql").render_as_string(hide_password=False)
        marker = f"medapp-hms:{tenant_id}"
        with psycopg.connect(admin_dsn, autocommit=True, connect_timeout=10) as conn:
            conn.execute("SET statement_timeout = '120s'")
            # A session lock also covers a retry after the management transaction
            # rolls back while database creation has already committed.
            conn.execute("SELECT pg_advisory_lock(%s)", (lock_key(f"hms-db:{target.database}"),))
            existing = conn.execute(
                "SELECT shobj_description(oid, 'pg_database'), pg_get_userbyid(datdba) "
                "FROM pg_database WHERE datname = %s",
                (target.database,),
            ).fetchone()
            if existing is not None:
                if existing != (marker, target.username):
                    raise RuntimeError("existing database has no matching tenant ownership record")
            else:
                conn.execute(
                    sql.SQL("CREATE DATABASE {} OWNER {}").format(
                        sql.Identifier(target.database), sql.Identifier(target.username)
                    )
                )
                conn.execute(
                    sql.SQL("COMMENT ON DATABASE {} IS {}").format(
                        sql.Identifier(target.database), sql.Literal(marker)
                    )
                )
            run_tenant_migrations(database_url)
    except Exception:
        # Drivers and migration tools can include credentials and patient schema
        # details in exceptions. Neither the API nor its logs should relay them.
        raise RuntimeError(
            "tenant database setup failed; administrator recovery is required"
        ) from None


def run_tenant_migrations(database_url: str) -> None:
    environment = os.environ.copy()
    environment["HMS_MIGRATION_DATABASE_URL"] = database_url
    try:
        result = subprocess.run(
            [sys.executable, "-m", "app.cli.migrate_tenant"],
            cwd=SERVICE_ROOT,
            env=environment,
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            raise RuntimeError
    except Exception:
        raise RuntimeError("tenant schema migration failed") from None
