"""idempotency_records table (audit finding B-17)

Revision ID: 20260523_0002
Revises: 20260518_0001
Create Date: 2026-05-23 00:01:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260523_0002"
down_revision = "20260518_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "idempotency_records",
        sa.Column("id", sa.UUID(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("scope", sa.String(length=64), nullable=False),
        sa.Column("key", sa.String(length=128), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("response_status", sa.Integer(), nullable=False),
        sa.Column("response_body", sa.JSON(), nullable=False),
    )
    op.create_index(
        "ix_idempotency_records_user_id", "idempotency_records", ["user_id"]
    )
    op.create_index(
        "ix_idempotency_records_scope", "idempotency_records", ["scope"]
    )
    op.create_index("ix_idempotency_records_key", "idempotency_records", ["key"])
    op.create_unique_constraint(
        "uq_idempotency_user_scope_key",
        "idempotency_records",
        ["user_id", "scope", "key"],
    )


def downgrade() -> None:
    op.drop_table("idempotency_records")
