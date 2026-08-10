"""split fullname into first and last name

Revision ID: 20260526_0003
Revises: 20260525_0002
Create Date: 2026-05-26
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260526_0003"
down_revision = "20260525_0002"
branch_labels = None
depends_on = None


def _columns() -> set[str]:
    bind = op.get_bind()
    return {col["name"] for col in sa.inspect(bind).get_columns("users")}


def upgrade() -> None:
    # The 0001 initial migration was later rewritten to create
    # `first_name` / `last_name` directly instead of `full_name`. On a
    # clean database 0001 therefore leaves nothing for this revision to
    # split, and the unconditional `add_column` below failed with
    # `DuplicateColumn: column "first_name" of relation "users" already
    # exists` — which meant user_service could not migrate from scratch
    # at all. Databases created before that rewrite still have
    # `full_name` and still need the split, so this revision now
    # inspects the live table and only does the work that is actually
    # outstanding. Both shapes converge on the same end state.
    columns = _columns()
    if "full_name" not in columns and {"first_name", "last_name"} <= columns:
        # Already in the post-split shape; only the role default (step 6)
        # is still worth asserting, and it is idempotent.
        op.alter_column("users", "role", server_default="user")
        return

    # 1. Add new columns as nullable first
    op.add_column("users", sa.Column("first_name", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("last_name", sa.String(255), nullable=True))

    # 2. Data migration: split full_name into first_name and last_name
    # Simple split on first space.
    op.execute(
        "UPDATE users SET "
        "first_name = SPLIT_PART(full_name, ' ', 1), "
        "last_name = SUBSTRING(full_name FROM POSITION(' ' IN full_name) + 1) "
        "WHERE full_name IS NOT NULL"
    )

    # 3. Handle cases where full_name had no space or was empty
    op.execute("UPDATE users SET last_name = '' WHERE last_name IS NULL")
    op.execute("UPDATE users SET first_name = 'User' WHERE first_name IS NULL OR first_name = ''")

    # 4. Make them non-nullable
    op.alter_column("users", "first_name", nullable=False)
    op.alter_column("users", "last_name", nullable=False)

    # 5. Drop old column
    op.drop_column("users", "full_name")

    # 6. Fix server default for role (from patient to user)
    op.alter_column("users", "role", server_default="user")


def downgrade() -> None:
    op.add_column("users", sa.Column("full_name", sa.String(255), nullable=True))
    op.execute("UPDATE users SET full_name = first_name || ' ' || last_name")
    op.alter_column("users", "full_name", nullable=False)
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")
    op.alter_column("users", "role", server_default="patient")
