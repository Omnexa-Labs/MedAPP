"""Patient-owned medication courses, dose reports and retained corrections."""

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects.postgresql import UUID

revision = "20260916_0006"
down_revision = "20260916_0005"
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
        "medication_courses",
        *timestamps(),
        sa.Column("patient_id", UUID(as_uuid=True), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column(
            "prescription_id", UUID(as_uuid=True), sa.ForeignKey("clinical_prescriptions.id")
        ),
        sa.Column("prescription_item", sa.Integer()),
        sa.Column("medicine", sa.JSON(), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date()),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("daily_times", sa.JSON(), nullable=False),
        sa.UniqueConstraint("prescription_id", "prescription_item", name="uq_medication_rx_item"),
    )
    op.create_index(
        "ix_medication_patient_created", "medication_courses", ["patient_id", "created_at", "id"]
    )
    op.create_table(
        "medication_doses",
        *timestamps(),
        sa.Column(
            "course_id", UUID(as_uuid=True), sa.ForeignKey("medication_courses.id"), nullable=False
        ),
        sa.Column("slot", sa.String(80), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("time", sa.String(5)),
        sa.Column("scheduled_at", sa.DateTime(timezone=True)),
        sa.Column("occurred_at", sa.DateTime(timezone=True)),
        sa.Column("outcome", sa.String(16), nullable=False),
        sa.Column("note", sa.String(500), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.UniqueConstraint("course_id", "slot", name="uq_medication_dose_slot"),
    )
    op.create_index("ix_medication_dose_course_day", "medication_doses", ["course_id", "day", "id"])
    op.create_table(
        "medication_events",
        *timestamps(),
        sa.Column(
            "course_id", UUID(as_uuid=True), sa.ForeignKey("medication_courses.id"), nullable=False
        ),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    op.create_index(
        "ix_medication_event_course_created", "medication_events", ["course_id", "created_at", "id"]
    )
    op.create_table(
        "medication_requests",
        *timestamps(),
        sa.Column("actor_id", UUID(as_uuid=True), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("response", sa.JSON()),
    )


def downgrade():
    if context.is_offline_mode() or op.get_bind().scalar(
        sa.text("SELECT count(*) FROM medication_courses")
    ):
        raise RuntimeError(
            "medication tracking evidence cannot be discarded; use a forward migration"
        )
    for table in (
        "medication_requests",
        "medication_events",
        "medication_doses",
        "medication_courses",
    ):
        op.drop_table(table)
