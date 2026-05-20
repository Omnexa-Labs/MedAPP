"""Initial management schema

Revision ID: 20260520_0001
Revises:
Create Date: 2026-05-20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260520_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tenant_registry",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("hospital_name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(128), nullable=False, unique=True),
        sa.Column("database_url", sa.String(512), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("provisioned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("config_json", postgresql.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_tenant_registry_slug", "tenant_registry", ["slug"])
    op.create_index("ix_tenant_registry_is_active", "tenant_registry", ["is_active"])

    op.create_table(
        "hms_staff_roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("hms_role", sa.String(32), nullable=False),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "user_id", name="uq_hms_staff_roles_tenant_user"),
    )
    op.create_index("ix_hms_staff_roles_tenant_id", "hms_staff_roles", ["tenant_id"])
    op.create_index("ix_hms_staff_roles_user_id", "hms_staff_roles", ["user_id"])
    op.create_index("ix_hms_staff_roles_hms_role", "hms_staff_roles", ["hms_role"])
    op.create_index("ix_hms_staff_roles_is_active", "hms_staff_roles", ["is_active"])


def downgrade() -> None:
    op.drop_table("hms_staff_roles")
    op.drop_table("tenant_registry")
