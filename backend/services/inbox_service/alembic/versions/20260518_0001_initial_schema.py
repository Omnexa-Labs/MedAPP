"""initial schema for inbox_service

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
        "threads",
        sa.Column("id", sa.UUID(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_by_user_id", sa.UUID(), nullable=False),
        sa.Column("assigned_role", sa.String(length=32), nullable=True),
        sa.Column("assigned_user_id", sa.UUID(), nullable=True),
        sa.Column("booking_id", sa.UUID(), nullable=True),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_threads_status", "threads", ["status"])
    op.create_index("ix_threads_created_by_user_id", "threads", ["created_by_user_id"])
    op.create_index("ix_threads_assigned_role", "threads", ["assigned_role"])
    op.create_index("ix_threads_assigned_user_id", "threads", ["assigned_user_id"])
    op.create_index("ix_threads_booking_id", "threads", ["booking_id"])

    op.create_table(
        "thread_participants",
        sa.Column("id", sa.UUID(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("thread_id", sa.UUID(), sa.ForeignKey("threads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("thread_id", "user_id", name="uq_thread_participant"),
    )
    op.create_index("ix_thread_participants_thread_id", "thread_participants", ["thread_id"])
    op.create_index("ix_thread_participants_user_id", "thread_participants", ["user_id"])
    op.create_index("ix_thread_participants_role", "thread_participants", ["role"])

    op.create_table(
        "thread_messages",
        sa.Column("id", sa.UUID(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("thread_id", sa.UUID(), sa.ForeignKey("threads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sender_user_id", sa.UUID(), nullable=True),
        sa.Column("sender_role", sa.String(length=32), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("is_internal", sa.Boolean(), nullable=False),
    )
    op.create_index("ix_thread_messages_thread_id", "thread_messages", ["thread_id"])
    op.create_index("ix_thread_messages_sender_user_id", "thread_messages", ["sender_user_id"])
    op.create_index("ix_thread_messages_sender_role", "thread_messages", ["sender_role"])


def downgrade() -> None:
    op.drop_table("thread_messages")
    op.drop_table("thread_participants")
    op.drop_table("threads")