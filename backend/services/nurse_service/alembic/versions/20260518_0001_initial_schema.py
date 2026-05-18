"""initial schema for nurse_service

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
        "nurse_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("first_name", sa.String(length=255), nullable=False),
        sa.Column("last_name", sa.String(length=255), nullable=False),
        sa.Column("specialty", sa.String(length=255), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("languages", sa.JSON(), nullable=False),
        sa.Column("home_visit_fee_cents", sa.Integer(), nullable=True),
        sa.Column("photo_url", sa.String(length=1024), nullable=True),
        sa.Column("is_listable", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_index(op.f("ix_nurse_profiles_user_id"), "nurse_profiles", ["user_id"], unique=True)
    op.create_index(op.f("ix_nurse_profiles_specialty"), "nurse_profiles", ["specialty"], unique=False)
    op.create_index(op.f("ix_nurse_profiles_is_listable"), "nurse_profiles", ["is_listable"], unique=False)
    op.create_index(op.f("ix_nurse_profiles_is_active"), "nurse_profiles", ["is_active"], unique=False)

    op.create_table(
        "nurse_service_areas",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("nurse_id", postgresql.UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("service_area_type", sa.String(length=32), nullable=False, server_default="radius"),
        sa.Column("center_latitude", sa.Float(), nullable=True),
        sa.Column("center_longitude", sa.Float(), nullable=True),
        sa.Column("radius_km", sa.Float(), nullable=True),
        sa.Column("polygon_geojson", sa.JSON(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.ForeignKeyConstraint(["nurse_id"], ["nurse_profiles.id"], ondelete="CASCADE"),
    )
    op.create_index(op.f("ix_nurse_service_areas_nurse_id"), "nurse_service_areas", ["nurse_id"], unique=True)
    op.create_index(op.f("ix_nurse_service_areas_is_active"), "nurse_service_areas", ["is_active"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_nurse_service_areas_is_active"), table_name="nurse_service_areas")
    op.drop_index(op.f("ix_nurse_service_areas_nurse_id"), table_name="nurse_service_areas")
    op.drop_table("nurse_service_areas")

    op.drop_index(op.f("ix_nurse_profiles_is_active"), table_name="nurse_profiles")
    op.drop_index(op.f("ix_nurse_profiles_is_listable"), table_name="nurse_profiles")
    op.drop_index(op.f("ix_nurse_profiles_specialty"), table_name="nurse_profiles")
    op.drop_index(op.f("ix_nurse_profiles_user_id"), table_name="nurse_profiles")
    op.drop_table("nurse_profiles")