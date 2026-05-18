"""initial schema for telemedicine_service

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
        "rooms",
        sa.Column("id", sa.UUID(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("booking_id", sa.UUID(), nullable=False),
        sa.Column("room_name", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("recording_enabled", sa.Boolean(), nullable=False),
        sa.Column("created_by_user_id", sa.UUID(), nullable=False),
        sa.UniqueConstraint("booking_id", name="uq_rooms_booking_id"),
        sa.UniqueConstraint("room_name", name="uq_rooms_room_name"),
    )
    op.create_index("ix_rooms_booking_id", "rooms", ["booking_id"])
    op.create_index("ix_rooms_room_name", "rooms", ["room_name"])
    op.create_index("ix_rooms_status", "rooms", ["status"])
    op.create_index("ix_rooms_created_by_user_id", "rooms", ["created_by_user_id"])

    op.create_table(
        "room_participants",
        sa.Column("id", sa.UUID(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("room_id", sa.UUID(), sa.ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("left_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("room_id", "user_id", name="uq_room_participant"),
    )
    op.create_index("ix_room_participants_room_id", "room_participants", ["room_id"])
    op.create_index("ix_room_participants_user_id", "room_participants", ["user_id"])

    op.create_table(
        "room_messages",
        sa.Column("id", sa.UUID(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("room_id", sa.UUID(), sa.ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sender_user_id", sa.UUID(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
    )
    op.create_index("ix_room_messages_room_id", "room_messages", ["room_id"])
    op.create_index("ix_room_messages_sender_user_id", "room_messages", ["sender_user_id"])


def downgrade() -> None:
    op.drop_table("room_messages")
    op.drop_table("room_participants")
    op.drop_table("rooms")