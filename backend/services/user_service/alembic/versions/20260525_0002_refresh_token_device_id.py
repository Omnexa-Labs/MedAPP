"""refresh_tokens.device_id for biometric-binding (Step 2 of biometric auth)

Revision ID: 20260525_0002
Revises: 20260515_0001
Create Date: 2026-05-25
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260525_0002"
down_revision = "20260515_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable so existing rows stay valid and old mobile builds (that
    # don't send X-Device-Id yet) keep working through the rollout.
    op.add_column(
        "refresh_tokens",
        sa.Column("device_id", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_refresh_tokens_device_id", "refresh_tokens", ["device_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_device_id", table_name="refresh_tokens")
    op.drop_column("refresh_tokens", "device_id")
