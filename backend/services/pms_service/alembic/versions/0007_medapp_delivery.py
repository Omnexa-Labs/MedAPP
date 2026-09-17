"""Durable pharmacy delivery and immutable inbound patient identity."""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import context, op

revision = "0007_medapp_delivery"
down_revision = "0006_sale_corrections"
branch_labels = None
depends_on = None


def upgrade():
    if not context.is_offline_mode() and op.get_bind().scalar(
        sa.text(
            "SELECT count(*) FROM (SELECT external_ref FROM prescriptions WHERE source='medapp' "
            "AND external_ref IS NOT NULL GROUP BY external_ref HAVING count(*) > 1) duplicates"
        )
    ):
        raise RuntimeError(
            "reconcile duplicate MedApp prescription references before this migration"
        )
    op.add_column(
        "prescriptions", sa.Column("medapp_patient_id", UUID(as_uuid=True), nullable=True)
    )
    op.add_column(
        "prescriptions",
        sa.Column("sync_sequence", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("prescriptions", sa.Column("ingest_hash", sa.String(64), nullable=True))
    op.create_index(
        "uq_prescriptions_medapp_external",
        "prescriptions",
        ["external_ref"],
        unique=True,
        postgresql_where=sa.text("source = 'medapp' AND external_ref IS NOT NULL"),
    )
    op.create_table(
        "medapp_deliveries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "prescription_id", UUID(as_uuid=True), sa.ForeignKey("prescriptions.id"), nullable=False
        ),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("state", sa.String(24), nullable=False, server_default="pending"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("leased_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lease_token", UUID(as_uuid=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(64), nullable=True),
        sa.UniqueConstraint("prescription_id", "sequence", name="uq_medapp_delivery_sequence"),
    )
    op.create_index(
        "ix_medapp_deliveries_prescription_id", "medapp_deliveries", ["prescription_id"]
    )
    op.create_index("ix_medapp_delivery_due", "medapp_deliveries", ["state", "next_attempt_at"])
    op.create_index("ix_medapp_delivery_lease", "medapp_deliveries", ["state", "leased_until"])


def downgrade():
    if context.is_offline_mode() or op.get_bind().scalar(
        sa.text(
            "SELECT (SELECT count(*) FROM medapp_deliveries) + (SELECT count(*) FROM prescriptions "
            "WHERE medapp_patient_id IS NOT NULL OR ingest_hash IS NOT NULL OR sync_sequence <> 0)"
        )
    ):
        raise RuntimeError(
            "cannot discard delivery or patient-link evidence; use a forward migration"
        )
    op.drop_table("medapp_deliveries")
    op.drop_index("uq_prescriptions_medapp_external", table_name="prescriptions")
    for column in ("ingest_hash", "sync_sequence", "medapp_patient_id"):
        op.drop_column("prescriptions", column)
