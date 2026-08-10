"""restore the created_at/updated_at server defaults on the telemedicine tables

Revision ID: 20260803_0002
Revises: 20260518_0001
Create Date: 2026-08-03

**This fixes a total outage of `POST /v1/rooms`.** `shared.db.TimestampMixin`
declares both timestamps as `server_default=func.now()`, so SQLAlchemy sends no
value for them and relies on the database to fill them in. The initial revision
`20260518_0001` created all three tables with `nullable=False` and **no**
server_default, so every INSERT died on:

    asyncpg.exceptions.NotNullViolationError: null value in column
    "created_at" of relation "rooms" violates not-null constraint

Not one room, participant or message could ever be created in a migrated
database. It surfaced while wiring booking_service's video provisioning: the
booking survived (by design) and logged `room_provision_upstream_error`, which
is how a 500 that had been sitting here since May became visible.

`booking_service`'s own initial revision got this right — its `created_at` /
`updated_at` carry `server_default=sa.func.now()`. This revision brings the
telemedicine tables in line with the model that was always describing them.

Idempotent: `ALTER COLUMN ... SET DEFAULT` is already a no-op when the default
matches, and the tables are checked for existence first.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260803_0002"
down_revision = "20260518_0001"
branch_labels = None
depends_on = None

TABLES = ("rooms", "room_participants", "room_messages")
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
                server_default=sa.text("now()"),
                existing_type=sa.DateTime(timezone=True),
                existing_nullable=False,
            )


def downgrade() -> None:
    present = _existing_tables()
    for table in TABLES:
        if table not in present:
            continue
        for column in COLUMNS:
            op.alter_column(
                table,
                column,
                server_default=None,
                existing_type=sa.DateTime(timezone=True),
                existing_nullable=False,
            )
