from __future__ import annotations

import asyncio
from logging.config import fileConfig
from pathlib import Path
import sys

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

# `BACKEND_DIR = BASE_DIR.parents[1]` used to be here and it CANNOT WORK IN THE
# CONTAINER: the service is copied to /app, so BASE_DIR is "/app" and
# parents[1] raises IndexError before alembic gets anywhere. Migrations for
# this service have therefore never run in Docker.
#
# The repo checkout has enough depth for it, which is why it survived — it only
# fails where it matters. Guarded rather than assumed: add the shared package
# only if that directory actually exists at the expected depth.
BASE_DIR = Path(__file__).resolve().parents[1]
_candidates = [BASE_DIR]
if len(BASE_DIR.parents) > 1:
    _candidates.insert(0, BASE_DIR.parents[1] / "shared")
for path in _candidates:
    if path.exists() and str(path) not in sys.path:
        sys.path.insert(0, str(path))

from app import models  # noqa: F401,E402
from app.config import settings  # noqa: E402
from app.db import Base  # noqa: E402

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url.replace("+asyncpg", "+psycopg"))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(url=config.get_main_option("sqlalchemy.url"), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    engine = create_async_engine(config.get_main_option("sqlalchemy.url"), pool_pre_ping=True)
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())