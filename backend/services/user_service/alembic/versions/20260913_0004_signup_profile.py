"""Persist self-reported blood type and primary health goal.

Revision ID: 20260913_0004
Revises: 20260526_0003
"""
import sqlalchemy as sa
from alembic import op

revision = "20260913_0004"
down_revision = "20260526_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("blood_type", sa.String(3), nullable=True))
    op.add_column("users", sa.Column("primary_goal", sa.String(16), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "primary_goal")
    op.drop_column("users", "blood_type")
