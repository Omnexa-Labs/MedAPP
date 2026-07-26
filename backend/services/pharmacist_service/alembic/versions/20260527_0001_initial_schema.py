"""initial schema for pharmacist_service

Revision ID: 20260527_0001
Revises:
Create Date: 2026-05-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260527_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pharmacist_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("first_name", sa.String(255), nullable=False),
        sa.Column("last_name", sa.String(255), nullable=False),
        sa.Column("license_number", sa.String(128), nullable=True),
        sa.Column("bio", sa.Text, nullable=True),
        sa.Column(
            "languages",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default=sa.text("ARRAY[]::varchar[]"),
        ),
        sa.Column(
            "specialties",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default=sa.text("ARRAY[]::varchar[]"),
        ),
        sa.Column("photo_url", sa.String(1024), nullable=True),
        # Soft reference to pharmacy_service.PharmacyProfile.id — no DB
        # FK because the two services own separate Postgres databases.
        sa.Column("affiliated_pharmacy_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_listable", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_pharmacist_profiles_user_id", "pharmacist_profiles", ["user_id"])
    op.create_index("ix_pharmacist_profiles_license_number", "pharmacist_profiles", ["license_number"])
    op.create_index("ix_pharmacist_profiles_affiliated_pharmacy_id", "pharmacist_profiles", ["affiliated_pharmacy_id"])
    op.create_index("ix_pharmacist_profiles_is_listable", "pharmacist_profiles", ["is_listable"])
    op.create_index("ix_pharmacist_profiles_is_active", "pharmacist_profiles", ["is_active"])


def downgrade() -> None:
    op.drop_table("pharmacist_profiles")
