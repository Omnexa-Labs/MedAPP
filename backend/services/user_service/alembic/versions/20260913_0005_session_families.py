"""Keep session identity stable across refresh rotation.

Revision ID: 20260913_0005
Revises: 20260913_0004
"""
import sqlalchemy as sa
from alembic import op

revision = "20260913_0005"
down_revision = "20260913_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("refresh_tokens", sa.Column("session_id", sa.Uuid(), nullable=True))
    op.add_column("refresh_tokens", sa.Column("session_started_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_refresh_tokens_session_id", "refresh_tokens", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_session_id", table_name="refresh_tokens")
    op.drop_column("refresh_tokens", "session_started_at")
    op.drop_column("refresh_tokens", "session_id")
