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


def upgrade() -> None:
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
