"""initial schema

Revision ID: 20260519_0001
Revises:
Create Date: 2026-05-19 00:01:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260519_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wearable_devices",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("owner_user_id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("external_id", sa.String(length=128), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("owner_user_id", "provider", "external_id", name="uq_wearable_device_source"),
    )
    op.create_index("ix_wearable_devices_owner_user_id", "wearable_devices", ["owner_user_id"])
    op.create_index("ix_wearable_devices_provider", "wearable_devices", ["provider"])

    op.create_table(
        "wearable_samples",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("device_id", sa.Uuid(), sa.ForeignKey("wearable_devices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_user_id", sa.String(length=36), nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("value", sa.String(length=128), nullable=False),
        sa.Column("unit", sa.String(length=32), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("sync_status", sa.String(length=16), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("sync_error", sa.String(length=512), nullable=True),
        sa.Column("synced_to_ehr", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("ehr_vital_id", sa.Uuid(), nullable=True),
    )
    op.create_index("ix_wearable_samples_owner_user_id", "wearable_samples", ["owner_user_id"])
    op.create_index("ix_wearable_samples_device_id", "wearable_samples", ["device_id"])
    op.create_index("ix_wearable_samples_kind", "wearable_samples", ["kind"])
    op.create_index("ix_wearable_samples_recorded_at", "wearable_samples", ["recorded_at"])


def downgrade() -> None:
    op.drop_index("ix_wearable_samples_recorded_at", table_name="wearable_samples")
    op.drop_index("ix_wearable_samples_kind", table_name="wearable_samples")
    op.drop_index("ix_wearable_samples_device_id", table_name="wearable_samples")
    op.drop_index("ix_wearable_samples_owner_user_id", table_name="wearable_samples")
    op.drop_table("wearable_samples")
    op.drop_index("ix_wearable_devices_provider", table_name="wearable_devices")
    op.drop_index("ix_wearable_devices_owner_user_id", table_name="wearable_devices")
    op.drop_table("wearable_devices")