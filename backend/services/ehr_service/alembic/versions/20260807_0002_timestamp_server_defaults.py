"""Add server defaults to created_at/updated_at across ehr_service.

WHY THIS EXISTS
---------------
Every PHI route on this service returned 500. Reproduced against the live
stack on 2026-08-07:

    GET /v1/patients/{id}/summary  -> 500
    GET /v1/patients/{id}/vitals   -> 500
    GET /v1/patients/{id}/records  -> 500

with, in the container log:

    asyncpg.exceptions.NotNullViolationError: null value in column "created_at"
    of relation "patients" violates not-null constraint
    [SQL: INSERT INTO patients (user_id, display_name, id) VALUES (...)
     RETURNING patients.created_at, patients.updated_at]

The reads 500 because each one lazily CREATES the patient row on first access,
and that insert cannot satisfy the NOT NULL.

`shared.db.base.TimestampMixin` declares both columns with
`server_default=func.now()`, so the MODEL is correct. But
`20260518_0001_initial_schema` is hand-written and spells the columns out as
`sa.Column("created_at", sa.DateTime(timezone=True), nullable=False)` with no
default. A hand-written migration does not consult model metadata, so the
column reached Postgres with NOT NULL and no DEFAULT, and the ORM emits neither
value on INSERT because it expects the server to supply them.

This is the same `server_default` defect already recorded against inbox,
hospital and lab — this is the fourth service, and the only one where it was
taking down every route rather than one insert path.

The initial migration is NOT edited: it has been applied, so editing it would
change nothing on an existing database and would silently diverge history from
what was run. This alters the live columns instead, which is also what a
deployed environment needs.

Backfill first, then set the default, then re-assert NOT NULL — in that order,
so the statement is safe on a table that already holds rows written before the
constraint existed.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260807_0002"
down_revision = "20260518_0001"
branch_labels = None
depends_on = None

# Every table in this service inherits TimestampMixin.
TABLES = ("patients", "vitals", "consents", "access_audit")
COLUMNS = ("created_at", "updated_at")


def upgrade() -> None:
    for table in TABLES:
        for column in COLUMNS:
            # Any row that predates the default would block the NOT NULL below.
            op.execute(
                f"UPDATE {table} SET {column} = now() WHERE {column} IS NULL"  # noqa: S608
            )
            op.alter_column(
                table,
                column,
                existing_type=sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                existing_nullable=False,
                nullable=False,
            )


def downgrade() -> None:
    for table in TABLES:
        for column in COLUMNS:
            op.alter_column(
                table,
                column,
                existing_type=sa.DateTime(timezone=True),
                server_default=None,
                existing_nullable=False,
                nullable=False,
            )
