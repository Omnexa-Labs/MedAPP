"""Clinical prescriptions, command receipts and durable pharmacy handoff."""

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects.postgresql import UUID

revision = "20260916_0005"
down_revision = "20260913_0004"
branch_labels = None
depends_on = None


def timestamps():
    return [
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    ]


def upgrade():
    op.create_table(
        "clinical_prescriptions",
        *timestamps(),
        sa.Column("patient_id", UUID(as_uuid=True), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("author_id", UUID(as_uuid=True), nullable=False),
        sa.Column("approval_id", UUID(as_uuid=True), nullable=False),
        sa.Column("prescriber_name", sa.String(511), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("items", sa.JSON(), nullable=False),
        sa.Column("clinical_goal", sa.String(500), nullable=False),
        sa.Column("valid_until", sa.Date(), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True)),
        sa.Column("cancelled_at", sa.DateTime(timezone=True)),
        sa.Column("change_reason", sa.String(500)),
        sa.Column(
            "replaces_id",
            UUID(as_uuid=True),
            sa.ForeignKey("clinical_prescriptions.id"),
            unique=True,
        ),
        sa.Column("pharmacy_id", UUID(as_uuid=True)),
    )
    op.create_index(
        "ix_clinical_rx_patient_created",
        "clinical_prescriptions",
        ["patient_id", "created_at", "id"],
    )
    op.create_index("ix_clinical_prescriptions_author_id", "clinical_prescriptions", ["author_id"])
    op.create_table(
        "prescription_requests",
        *timestamps(),
        sa.Column("actor_id", UUID(as_uuid=True), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("response", sa.JSON()),
    )
    op.create_table(
        "prescription_deliveries",
        *timestamps(),
        sa.Column(
            "prescription_id",
            UUID(as_uuid=True),
            sa.ForeignKey("clinical_prescriptions.id"),
            nullable=False,
        ),
        sa.Column("operation", sa.String(16), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("state", sa.String(16), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("lease_token", UUID(as_uuid=True)),
        sa.Column("error_code", sa.String(64)),
        sa.Column("acknowledgement", sa.JSON()),
        sa.UniqueConstraint(
            "prescription_id", "operation", name="uq_clinical_rx_delivery_operation"
        ),
    )
    op.create_index(
        "ix_clinical_rx_delivery_due", "prescription_deliveries", ["state", "next_attempt_at"]
    )


def downgrade():
    if context.is_offline_mode() or op.get_bind().scalar(
        sa.text("SELECT count(*) FROM clinical_prescriptions")
    ):
        raise RuntimeError(
            "clinical prescribing evidence cannot be discarded; use a forward migration"
        )
    op.drop_table("prescription_deliveries")
    op.drop_table("prescription_requests")
    op.drop_table("clinical_prescriptions")
