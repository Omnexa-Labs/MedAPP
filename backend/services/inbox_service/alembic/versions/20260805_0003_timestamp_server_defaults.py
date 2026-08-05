"""restore the created_at/updated_at server defaults on the inbox tables

Revision ID: 20260805_0003
Revises: 20260805_0002
Create Date: 2026-08-05

**EVERY INSERT INTO THESE TABLES FAILS ON A MIGRATED DATABASE.**
`shared.db.TimestampMixin` declares both timestamps as
`server_default=func.now()`, so SQLAlchemy sends NO value for them and relies on
the database to fill them in. Revision `20260518_0001` created these tables
`nullable=False` with **no** server_default, so every write dies on:

    asyncpg.exceptions.NotNullViolationError: null value in column
    "created_at" of relation "threads" violates not-null constraint

Confirmed by querying the live database rather than by reading the migration:

    SELECT table_name, column_name, column_default
    FROM information_schema.columns
    WHERE column_name IN ('created_at','updated_at') AND table_schema='public';
    -> column_default NULL for all six columns

WHY THE TESTS NEVER CAUGHT IT, which is the part worth remembering: the suites
build their schema with `Base.metadata.create_all`, which reads the MODEL - and
the model carries the mixin's defaults. So the tests exercise a correct schema
that Alembic never produces. The test double was more capable than production,
and a green suite sat on top of a service that could not write a row. The same
shape as `ehr_service`'s dict-vs-Principal dependency: when a fixture is more
generous than the real thing, the gap is invisible by construction.

This is the third instance of this exact defect. `telemedicine_service` rev
`20260803_0002` fixed its three tables on 2026-08-03; `booking_service`'s initial
revision got it right from the start. A live scan of all twenty databases
confirmed these are the last of them.

Idempotent: `ALTER COLUMN ... SET DEFAULT` is a no-op when the default already
matches, and each table is checked for existence first - a service whose tables
were created by `create_all` rather than by Alembic must not blow up here.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260805_0003"
down_revision = "20260805_0002"
branch_labels = None
depends_on = None

TABLES = ('threads', 'thread_participants', 'thread_messages')
COLUMNS = ("created_at", "updated_at")


def _existing_tables() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return set(inspector.get_table_names())


def upgrade() -> None:
    present = _existing_tables()
    for table in TABLES:
        if table not in present:
            continue
        for column in COLUMNS:
            op.alter_column(
                table,
                column,
                existing_type=sa.DateTime(timezone=True),
                existing_nullable=False,
                server_default=sa.func.now(),
            )


def downgrade() -> None:
    # Dropping the defaults restores the broken state on purpose: a downgrade
    # should land where the previous revision actually left the schema, not
    # somewhere tidier. Anything inserted meanwhile keeps its stored value -
    # a DEFAULT is only consulted at INSERT time.
    present = _existing_tables()
    for table in TABLES:
        if table not in present:
            continue
        for column in COLUMNS:
            op.alter_column(
                table,
                column,
                existing_type=sa.DateTime(timezone=True),
                existing_nullable=False,
                server_default=None,
            )
