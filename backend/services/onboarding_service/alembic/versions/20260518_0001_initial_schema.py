"""initial schema for onboarding_service

Revision ID: 20260518_0001
Revises:
Create Date: 2026-05-18 00:03:00.000000

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
        "partner_applications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("partner_type", sa.String(length=32), nullable=False),
        sa.Column("onboarding_mode", sa.String(length=32), nullable=True),
        sa.Column("legal_name", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("specialty", sa.String(length=255), nullable=True),
        sa.Column("license_number", sa.String(length=255), nullable=True),
        sa.Column("registration_number", sa.String(length=255), nullable=True),
        sa.Column("tax_id", sa.String(length=255), nullable=True),
        sa.Column("country", sa.String(length=128), nullable=True),
        sa.Column("city", sa.String(length=128), nullable=True),
        sa.Column("address_line1", sa.String(length=255), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=64), nullable=True),
        sa.Column("website_url", sa.String(length=512), nullable=True),
        sa.Column("submitted_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("documents_json", sa.JSON(), nullable=False),
        sa.Column("team_members_json", sa.JSON(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index(op.f("ix_partner_applications_partner_type"), "partner_applications", ["partner_type"], unique=False)
    op.create_index(op.f("ix_partner_applications_onboarding_mode"), "partner_applications", ["onboarding_mode"], unique=False)
    op.create_index(op.f("ix_partner_applications_submitted_by_user_id"), "partner_applications", ["submitted_by_user_id"], unique=False)
    op.create_index(op.f("ix_partner_applications_status"), "partner_applications", ["status"], unique=False)
    op.create_index(op.f("ix_partner_applications_reviewed_by_user_id"), "partner_applications", ["reviewed_by_user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_partner_applications_reviewed_by_user_id"), table_name="partner_applications")
    op.drop_index(op.f("ix_partner_applications_status"), table_name="partner_applications")
    op.drop_index(op.f("ix_partner_applications_submitted_by_user_id"), table_name="partner_applications")
    op.drop_index(op.f("ix_partner_applications_onboarding_mode"), table_name="partner_applications")
    op.drop_index(op.f("ix_partner_applications_partner_type"), table_name="partner_applications")
    op.drop_table("partner_applications")