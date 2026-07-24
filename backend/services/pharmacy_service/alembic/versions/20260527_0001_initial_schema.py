"""initial schema for pharmacy_service

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
        "pharmacy_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(128), nullable=False, unique=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("license_number", sa.String(128), nullable=True),
        sa.Column(
            "license_categories",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default=sa.text("ARRAY[]::varchar[]"),
        ),
        sa.Column("address_line1", sa.String(255), nullable=True),
        sa.Column("city", sa.String(128), nullable=True),
        sa.Column("country", sa.String(128), nullable=True),
        sa.Column("latitude", sa.Float, nullable=True),
        sa.Column("longitude", sa.Float, nullable=True),
        sa.Column("phone", sa.String(64), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("website_url", sa.String(512), nullable=True),
        sa.Column(
            "insurance_accepted",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default=sa.text("ARRAY[]::varchar[]"),
        ),
        sa.Column("operating_hours", postgresql.JSONB, nullable=True),
        sa.Column("photo_url", sa.String(1024), nullable=True),
        sa.Column("pms_base_url", sa.String(512), nullable=True),
        sa.Column("pms_partner_secret_id", sa.String(128), nullable=True),
        sa.Column("is_listable", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_pharmacy_profiles_user_id", "pharmacy_profiles", ["user_id"])
    op.create_index("ix_pharmacy_profiles_slug", "pharmacy_profiles", ["slug"])
    op.create_index("ix_pharmacy_profiles_city", "pharmacy_profiles", ["city"])
    op.create_index("ix_pharmacy_profiles_country", "pharmacy_profiles", ["country"])
    op.create_index("ix_pharmacy_profiles_is_listable", "pharmacy_profiles", ["is_listable"])
    op.create_index("ix_pharmacy_profiles_is_active", "pharmacy_profiles", ["is_active"])


def downgrade() -> None:
    op.drop_table("pharmacy_profiles")
