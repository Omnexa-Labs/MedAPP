"""Prescription expiry and durable cancellation-before-delivery receipts."""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import context, op

revision = "0008_clinical_handoff"
down_revision = "0007_medapp_delivery"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("prescriptions", sa.Column("valid_until", sa.Date()))
    op.create_table(
        "clinical_handoff_receipts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("patient_id", UUID(as_uuid=True), nullable=False),
        sa.Column("pharmacy_id", UUID(as_uuid=True), nullable=False),
        sa.Column("payload_hash", sa.String(64)),
        sa.Column("send_ack", sa.JSON()),
        sa.Column("cancel_ack", sa.JSON()),
    )


def downgrade():
    if context.is_offline_mode() or op.get_bind().scalar(
        sa.text(
            "SELECT (SELECT count(*) FROM clinical_handoff_receipts) + "
            "(SELECT count(*) FROM prescriptions WHERE valid_until IS NOT NULL)"
        )
    ):
        raise RuntimeError(
            "prescription handoff evidence cannot be discarded; use a forward migration"
        )
    op.drop_table("clinical_handoff_receipts")
    op.drop_column("prescriptions", "valid_until")
