"""Add server defaults to created_at/updated_at (onboarding_service).

Part of the repo-wide sweep on 2026-08-07. The hand-written initial migration
spells these columns as `nullable=False` with NO `server_default`, so although
`shared.db.base.TimestampMixin` declares `server_default=func.now()`, the live
Postgres column reached production with NOT NULL and no DEFAULT. A hand-written
migration never consults model metadata.

The ORM emits neither value on INSERT because it expects the server to supply
them, so the first write to any of these tables fails with:

    asyncpg.exceptions.NotNullViolationError:
    null value in column "created_at" ... violates not-null constraint

Confirmed live in ehr_service (every PHI route 500d) and social_service
(POST /posts/{id}/comments 500d). Both were found only by writing to a running
service; no test catches it, because suites use a schema built from model
metadata, which HAS the default.

The initial migration is deliberately NOT edited: it has already been applied,
so editing it changes nothing on an existing database and silently diverges
history from what was run.

Order matters - backfill, then set the default, then re-assert NOT NULL - so the
statement is safe on a table that already holds rows.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260807_ts"
down_revision = "20260518_0001"
branch_labels = None
depends_on = None

TABLES = ('partner_applications',)
COLUMNS = ("created_at", "updated_at")


def upgrade() -> None:
    for table in TABLES:
        for column in COLUMNS:
            op.execute(f"UPDATE {table} SET {column} = now() WHERE {column} IS NULL")  # noqa: S608
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
