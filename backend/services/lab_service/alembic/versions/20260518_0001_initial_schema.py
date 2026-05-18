"""initial schema for lab_service

Revision ID: 20260518_0001
Revises:
Create Date: 2026-05-18 00:01:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "20260518_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "partner_labs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False, unique=True),
        sa.Column("slug", sa.String(length=128), nullable=False, unique=True),
        sa.Column("contact_email", sa.String(length=255), nullable=True),
        sa.Column("contact_phone", sa.String(length=64), nullable=True),
        sa.Column("integration_type", sa.String(length=64), nullable=False),
        sa.Column("external_reference", sa.String(length=255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_index(op.f("ix_partner_labs_slug"), "partner_labs", ["slug"], unique=True)
    op.create_index(op.f("ix_partner_labs_is_active"), "partner_labs", ["is_active"], unique=False)

    op.create_table(
        "lab_orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ordered_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("test_name", sa.String(length=255), nullable=False),
        sa.Column("priority", sa.String(length=32), nullable=False, server_default="routine"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="ordered"),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f("ix_lab_orders_patient_id"), "lab_orders", ["patient_id"], unique=False)
    op.create_index(op.f("ix_lab_orders_ordered_by_user_id"), "lab_orders", ["ordered_by_user_id"], unique=False)
    op.create_index(op.f("ix_lab_orders_priority"), "lab_orders", ["priority"], unique=False)
    op.create_index(op.f("ix_lab_orders_status"), "lab_orders", ["status"], unique=False)

    op.create_table(
        "lab_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("lab_order_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("uploaded_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source", sa.String(length=64), nullable=False, server_default="patient_upload"),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("file_name", sa.String(length=255), nullable=True),
        sa.Column("mime_type", sa.String(length=128), nullable=True),
        sa.Column("storage_key", sa.String(length=255), nullable=True),
        sa.Column("external_url", sa.String(length=512), nullable=True),
        sa.Column("raw_text", sa.Text(), nullable=True),
        sa.Column("parsed_values", sa.JSON(), nullable=True),
        sa.Column("resulted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="available"),
    )
    op.create_index(op.f("ix_lab_results_patient_id"), "lab_results", ["patient_id"], unique=False)
    op.create_index(op.f("ix_lab_results_lab_order_id"), "lab_results", ["lab_order_id"], unique=False)
    op.create_index(op.f("ix_lab_results_uploaded_by_user_id"), "lab_results", ["uploaded_by_user_id"], unique=False)
    op.create_index(op.f("ix_lab_results_source"), "lab_results", ["source"], unique=False)
    op.create_index(op.f("ix_lab_results_status"), "lab_results", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_lab_results_status"), table_name="lab_results")
    op.drop_index(op.f("ix_lab_results_source"), table_name="lab_results")
    op.drop_index(op.f("ix_lab_results_uploaded_by_user_id"), table_name="lab_results")
    op.drop_index(op.f("ix_lab_results_lab_order_id"), table_name="lab_results")
    op.drop_index(op.f("ix_lab_results_patient_id"), table_name="lab_results")
    op.drop_table("lab_results")

    op.drop_index(op.f("ix_lab_orders_status"), table_name="lab_orders")
    op.drop_index(op.f("ix_lab_orders_priority"), table_name="lab_orders")
    op.drop_index(op.f("ix_lab_orders_ordered_by_user_id"), table_name="lab_orders")
    op.drop_index(op.f("ix_lab_orders_patient_id"), table_name="lab_orders")
    op.drop_table("lab_orders")

    op.drop_index(op.f("ix_partner_labs_is_active"), table_name="partner_labs")
    op.drop_index(op.f("ix_partner_labs_slug"), table_name="partner_labs")
    op.drop_table("partner_labs")