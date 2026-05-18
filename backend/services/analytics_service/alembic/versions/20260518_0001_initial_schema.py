"""initial schema for analytics_service

Revision ID: 20260518_0001
Revises:
Create Date: 2026-05-18 00:01:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260518_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "event_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=128), nullable=False),
        sa.Column("source", sa.String(length=255), nullable=False),
        sa.Column("subject_hash", sa.String(length=128), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("booking_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("doctor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("payment_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("amount_cents", sa.Integer(), nullable=True),
        sa.Column("currency", sa.String(length=8), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.UniqueConstraint("event_id", name="uq_event_log_event_id"),
    )
    op.create_index(op.f("ix_event_log_event_type"), "event_log", ["event_type"], unique=False)
    op.create_index(op.f("ix_event_log_subject_hash"), "event_log", ["subject_hash"], unique=False)
    op.create_index(op.f("ix_event_log_occurred_at"), "event_log", ["occurred_at"], unique=False)
    op.create_index(op.f("ix_event_log_booking_id"), "event_log", ["booking_id"], unique=False)
    op.create_index(op.f("ix_event_log_doctor_id"), "event_log", ["doctor_id"], unique=False)
    op.create_index(op.f("ix_event_log_payment_id"), "event_log", ["payment_id"], unique=False)
    op.create_index(op.f("ix_event_log_status"), "event_log", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_event_log_status"), table_name="event_log")
    op.drop_index(op.f("ix_event_log_payment_id"), table_name="event_log")
    op.drop_index(op.f("ix_event_log_doctor_id"), table_name="event_log")
    op.drop_index(op.f("ix_event_log_booking_id"), table_name="event_log")
    op.drop_index(op.f("ix_event_log_occurred_at"), table_name="event_log")
    op.drop_index(op.f("ix_event_log_subject_hash"), table_name="event_log")
    op.drop_index(op.f("ix_event_log_event_type"), table_name="event_log")
    op.drop_table("event_log")