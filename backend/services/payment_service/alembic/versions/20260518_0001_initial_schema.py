"""initial schema for payment_service

Revision ID: 20260518_0001
Revises:
Create Date: 2026-05-18 00:01:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260518_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payments",
        sa.Column("id", sa.UUID(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("booking_id", sa.UUID(), nullable=True),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("method", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("provider_reference", sa.String(length=128), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=True),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_payments_user_id", "payments", ["user_id"])
    op.create_index("ix_payments_booking_id", "payments", ["booking_id"])
    op.create_index("ix_payments_method", "payments", ["method"])
    op.create_index("ix_payments_status", "payments", ["status"])
    op.create_unique_constraint("uq_payments_provider_reference", "payments", ["provider_reference"])
    op.create_unique_constraint("uq_payments_idempotency_key", "payments", ["idempotency_key"])

    op.create_table(
        "refunds",
        sa.Column("id", sa.UUID(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payment_id", sa.UUID(), sa.ForeignKey("payments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("provider_reference", sa.String(length=128), nullable=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_refunds_payment_id", "refunds", ["payment_id"])
    op.create_index("ix_refunds_provider_reference", "refunds", ["provider_reference"])

    op.create_table(
        "provider_events",
        sa.Column("id", sa.UUID(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("event_id", sa.String(length=128), nullable=False),
        sa.Column("payment_id", sa.UUID(), nullable=True),
        sa.Column("raw_body", sa.JSON(), nullable=False),
        sa.Column("parsed_status", sa.String(length=32), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
    )
    op.create_index("ix_provider_events_provider", "provider_events", ["provider"])
    op.create_index("ix_provider_events_event_id", "provider_events", ["event_id"], unique=True)
    op.create_index("ix_provider_events_payment_id", "provider_events", ["payment_id"])


def downgrade() -> None:
    op.drop_table("provider_events")
    op.drop_table("refunds")
    op.drop_table("payments")