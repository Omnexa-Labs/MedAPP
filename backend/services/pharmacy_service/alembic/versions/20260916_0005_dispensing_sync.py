"""Patient-owned pharmacy dispensing history and immutable delivery receipts."""

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects.postgresql import UUID

revision = "20260916_0005"
down_revision = "20260915_0004"
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
        "pharmacy_prescriptions",
        *timestamps(),
        sa.Column(
            "pharmacy_id", UUID(as_uuid=True), sa.ForeignKey("pharmacy_profiles.id"), nullable=False
        ),
        sa.Column("pms_prescription_id", UUID(as_uuid=True), nullable=False),
        sa.Column("patient_id", UUID(as_uuid=True), nullable=False),
        sa.Column("external_ref", sa.String(128), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "pharmacy_id", "pms_prescription_id", name="uq_pharmacy_pms_prescription"
        ),
        sa.UniqueConstraint(
            "pharmacy_id", "external_ref", name="uq_pharmacy_prescription_external"
        ),
    )
    op.create_index(
        "ix_pharmacy_prescriptions_patient_updated",
        "pharmacy_prescriptions",
        ["patient_id", "updated_at", "id"],
    )
    op.create_table(
        "pharmacy_prescription_events",
        *timestamps(),
        sa.Column(
            "prescription_id",
            UUID(as_uuid=True),
            sa.ForeignKey("pharmacy_prescriptions.id"),
            nullable=False,
        ),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("acknowledgement", sa.JSON(), nullable=False),
        sa.UniqueConstraint(
            "prescription_id", "sequence", name="uq_pharmacy_prescription_event_sequence"
        ),
    )
    op.create_index(
        "ix_pharmacy_prescription_events_prescription_id",
        "pharmacy_prescription_events",
        ["prescription_id"],
    )


def downgrade():
    if context.is_offline_mode() or op.get_bind().scalar(
        sa.text("SELECT count(*) FROM pharmacy_prescriptions")
    ):
        raise RuntimeError("cannot discard pharmacy dispensing evidence; use a forward migration")
    op.drop_table("pharmacy_prescription_events")
    op.drop_table("pharmacy_prescriptions")
