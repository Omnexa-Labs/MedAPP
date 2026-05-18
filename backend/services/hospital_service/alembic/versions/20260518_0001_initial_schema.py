"""initial schema for hospital_service

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
        "hospital_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False, unique=True),
        sa.Column("slug", sa.String(length=128), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("specialty", sa.String(length=255), nullable=True),
        sa.Column("insurance_accepted", sa.JSON(), nullable=False),
        sa.Column("address_line1", sa.String(length=255), nullable=True),
        sa.Column("city", sa.String(length=128), nullable=True),
        sa.Column("country", sa.String(length=128), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("website_url", sa.String(length=512), nullable=True),
        sa.Column("contact_phone", sa.String(length=64), nullable=True),
        sa.Column("contact_email", sa.String(length=255), nullable=True),
        sa.Column("accreditation", sa.String(length=255), nullable=True),
        sa.Column("accreditation_status", sa.String(length=64), nullable=False, server_default="pending"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_index(op.f("ix_hospital_profiles_name"), "hospital_profiles", ["name"], unique=True)
    op.create_index(op.f("ix_hospital_profiles_slug"), "hospital_profiles", ["slug"], unique=True)
    op.create_index(op.f("ix_hospital_profiles_specialty"), "hospital_profiles", ["specialty"], unique=False)
    op.create_index(op.f("ix_hospital_profiles_city"), "hospital_profiles", ["city"], unique=False)
    op.create_index(op.f("ix_hospital_profiles_country"), "hospital_profiles", ["country"], unique=False)
    op.create_index(op.f("ix_hospital_profiles_accreditation_status"), "hospital_profiles", ["accreditation_status"], unique=False)
    op.create_index(op.f("ix_hospital_profiles_is_active"), "hospital_profiles", ["is_active"], unique=False)

    op.create_table(
        "hospital_staff",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("hospital_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False, server_default="other"),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("department", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.ForeignKeyConstraint(["hospital_id"], ["hospital_profiles.id"], ondelete="CASCADE"),
    )
    op.create_index(op.f("ix_hospital_staff_hospital_id"), "hospital_staff", ["hospital_id"], unique=False)
    op.create_index(op.f("ix_hospital_staff_user_id"), "hospital_staff", ["user_id"], unique=False)
    op.create_index(op.f("ix_hospital_staff_role"), "hospital_staff", ["role"], unique=False)
    op.create_index(op.f("ix_hospital_staff_is_active"), "hospital_staff", ["is_active"], unique=False)

    op.create_table(
        "hospital_reviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("hospital_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reviewer_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("moderation_status", sa.String(length=32), nullable=False, server_default="approved"),
        sa.ForeignKeyConstraint(["hospital_id"], ["hospital_profiles.id"], ondelete="CASCADE"),
    )
    op.create_index(op.f("ix_hospital_reviews_hospital_id"), "hospital_reviews", ["hospital_id"], unique=False)
    op.create_index(op.f("ix_hospital_reviews_reviewer_user_id"), "hospital_reviews", ["reviewer_user_id"], unique=False)
    op.create_index(op.f("ix_hospital_reviews_rating"), "hospital_reviews", ["rating"], unique=False)
    op.create_index(op.f("ix_hospital_reviews_is_public"), "hospital_reviews", ["is_public"], unique=False)
    op.create_index(op.f("ix_hospital_reviews_moderation_status"), "hospital_reviews", ["moderation_status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_hospital_reviews_moderation_status"), table_name="hospital_reviews")
    op.drop_index(op.f("ix_hospital_reviews_is_public"), table_name="hospital_reviews")
    op.drop_index(op.f("ix_hospital_reviews_rating"), table_name="hospital_reviews")
    op.drop_index(op.f("ix_hospital_reviews_reviewer_user_id"), table_name="hospital_reviews")
    op.drop_index(op.f("ix_hospital_reviews_hospital_id"), table_name="hospital_reviews")
    op.drop_table("hospital_reviews")

    op.drop_index(op.f("ix_hospital_staff_is_active"), table_name="hospital_staff")
    op.drop_index(op.f("ix_hospital_staff_role"), table_name="hospital_staff")
    op.drop_index(op.f("ix_hospital_staff_user_id"), table_name="hospital_staff")
    op.drop_index(op.f("ix_hospital_staff_hospital_id"), table_name="hospital_staff")
    op.drop_table("hospital_staff")

    op.drop_index(op.f("ix_hospital_profiles_is_active"), table_name="hospital_profiles")
    op.drop_index(op.f("ix_hospital_profiles_accreditation_status"), table_name="hospital_profiles")
    op.drop_index(op.f("ix_hospital_profiles_country"), table_name="hospital_profiles")
    op.drop_index(op.f("ix_hospital_profiles_city"), table_name="hospital_profiles")
    op.drop_index(op.f("ix_hospital_profiles_specialty"), table_name="hospital_profiles")
    op.drop_index(op.f("ix_hospital_profiles_slug"), table_name="hospital_profiles")
    op.drop_index(op.f("ix_hospital_profiles_name"), table_name="hospital_profiles")
    op.drop_table("hospital_profiles")