"""Future schedule revisions and opt-in medication push reminders."""

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects.postgresql import UUID

revision = "20260917_0007"
down_revision = "20260916_0006"
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
    op.add_column(
        "medication_courses",
        sa.Column("schedule_changes", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )
    op.add_column(
        "medication_courses",
        sa.Column("reminders_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("medication_courses", sa.Column("reminders_since", sa.DateTime(timezone=True)))
    op.create_index(
        "ix_medication_reminder_courses",
        "medication_courses",
        ["reminders_enabled", "status", "id"],
    )
    op.create_table(
        "medication_reminder_devices",
        *timestamps(),
        sa.Column("patient_id", UUID(as_uuid=True), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("push_token", sa.String(255), nullable=False, unique=True),
        sa.Column("binding_id", UUID(as_uuid=True), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_medication_device_owner", "medication_reminder_devices", ["patient_id", "enabled"]
    )
    op.create_table(
        "medication_reminder_attempts",
        *timestamps(),
        sa.Column(
            "course_id", UUID(as_uuid=True), sa.ForeignKey("medication_courses.id"), nullable=False
        ),
        sa.Column(
            "device_id",
            UUID(as_uuid=True),
            sa.ForeignKey("medication_reminder_devices.id"),
            nullable=False,
        ),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("state", sa.String(24), nullable=False),
        sa.Column("provider_reference", sa.String(255)),
        sa.Column("error_code", sa.String(64)),
        sa.UniqueConstraint(
            "course_id", "device_id", "scheduled_at", name="uq_medication_reminder_slot"
        ),
    )
    op.create_index(
        "ix_medication_reminder_history",
        "medication_reminder_attempts",
        ["course_id", "created_at", "id"],
    )


def downgrade():
    if context.is_offline_mode() or op.get_bind().scalar(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM medication_reminder_devices) OR "
            "EXISTS (SELECT 1 FROM medication_courses WHERE reminders_enabled OR json_array_length(schedule_changes) > 0)"
            " OR EXISTS (SELECT 1 FROM medication_events WHERE kind IN ('schedule_changed', 'reminders_changed'))"
            " OR EXISTS (SELECT 1 FROM medication_requests WHERE response::jsonb ? 'schedule_changes')"
        )
    ):
        raise RuntimeError(
            "schedule/reminder evidence cannot be discarded; use a forward migration"
        )
    op.drop_table("medication_reminder_attempts")
    op.drop_table("medication_reminder_devices")
    op.drop_index("ix_medication_reminder_courses", table_name="medication_courses")
    for name in ("reminders_since", "reminders_enabled", "schedule_changes"):
        op.drop_column("medication_courses", name)
