"""initial schema for doctor_service

Revision ID: 20260517_0001
Revises:
Create Date: 2026-05-17
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260517_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "doctor_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("first_name", sa.String(255), nullable=False),
        sa.Column("last_name", sa.String(255), nullable=False),
        sa.Column("specialty", sa.String(255), nullable=True),
        sa.Column("bio", sa.Text, nullable=True),
        sa.Column("languages", postgresql.JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("consultation_fee_cents", sa.Integer, nullable=True),
        sa.Column("photo_url", sa.String(1024), nullable=True),
        sa.Column("is_listable", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_doctor_profiles_user_id", "doctor_profiles", ["user_id"])
    op.create_index("ix_doctor_profiles_specialty", "doctor_profiles", ["specialty"])
    op.create_index("ix_doctor_profiles_is_listable", "doctor_profiles", ["is_listable"])
    op.create_index("ix_doctor_profiles_is_active", "doctor_profiles", ["is_active"])

    op.create_table(
        "doctor_availability_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "doctor_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("doctor_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("day_of_week", sa.Integer, nullable=False),
        sa.Column("start_time", sa.Time, nullable=False),
        sa.Column("end_time", sa.Time, nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="UTC"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_doctor_availability_rules_doctor_id", "doctor_availability_rules", ["doctor_id"])
    op.create_index("ix_doctor_availability_rules_day_of_week", "doctor_availability_rules", ["day_of_week"])
    op.create_index("ix_doctor_availability_rules_is_active", "doctor_availability_rules", ["is_active"])


def downgrade() -> None:
    op.drop_table("doctor_availability_rules")
    op.drop_table("doctor_profiles")