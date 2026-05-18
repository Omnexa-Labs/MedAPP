"""initial schema for notification_service

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
        "notification_preferences",
        sa.Column("id", sa.UUID(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("locale", sa.String(length=8), nullable=False),
        sa.Column("push_enabled", sa.Boolean(), nullable=False),
        sa.Column("sms_enabled", sa.Boolean(), nullable=False),
        sa.Column("email_enabled", sa.Boolean(), nullable=False),
        sa.Column("in_app_enabled", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("user_id", name="uq_notification_preferences_user_id"),
    )
    op.create_index("ix_notification_preferences_user_id", "notification_preferences", ["user_id"])

    op.create_table(
        "delivery_log",
        sa.Column("id", sa.UUID(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("event_id", sa.String(length=128), nullable=False),
        sa.Column("recipient_user_id", sa.UUID(), nullable=False),
        sa.Column("actor_user_id", sa.UUID(), nullable=True),
        sa.Column("channel", sa.String(length=16), nullable=False),
        sa.Column("locale", sa.String(length=8), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("provider_reference", sa.String(length=128), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.UniqueConstraint("event_id", "channel", name="uq_delivery_log_event_channel"),
    )
    op.create_index("ix_delivery_log_event_id", "delivery_log", ["event_id"])
    op.create_index("ix_delivery_log_recipient_user_id", "delivery_log", ["recipient_user_id"])
    op.create_index("ix_delivery_log_event_type", "delivery_log", ["event_type"])
    op.create_index("ix_delivery_log_status", "delivery_log", ["status"])


def downgrade() -> None:
    op.drop_table("delivery_log")
    op.drop_table("notification_preferences")