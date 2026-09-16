"""Keep unpublished hospital edits separate from the patient directory."""

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects.postgresql import UUID

revision = "20260915_0005"
down_revision = "20260914_0004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("hospital_profiles", sa.Column("directory_draft", sa.JSON(), nullable=True))
    op.add_column(
        "hospital_profiles",
        sa.Column("directory_version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "hospital_profiles",
        sa.Column("directory_published_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "hospital_directory_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "hospital_id", UUID(as_uuid=True), sa.ForeignKey("hospital_profiles.id"), nullable=False
        ),
        sa.Column("actor_id", UUID(as_uuid=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("changed_fields", sa.JSON(), nullable=False),
        sa.Column("before", sa.JSON(), nullable=False),
        sa.Column("after", sa.JSON(), nullable=False),
        sa.UniqueConstraint("hospital_id", "version", name="uq_hospital_directory_event_version"),
    )
    op.create_index(
        "ix_hospital_directory_events_hospital_created",
        "hospital_directory_events",
        ["hospital_id", "created_at"],
    )


def downgrade():
    if context.is_offline_mode() or op.get_bind().scalar(
        sa.text(
            "SELECT (SELECT count(*) FROM hospital_directory_events) + "
            "(SELECT count(*) FROM hospital_profiles WHERE directory_draft IS NOT NULL "
            "OR directory_version <> 1 OR directory_published_at IS NOT NULL)"
        )
    ):
        raise RuntimeError(
            "cannot discard hospital profile drafts or publication history; use a forward migration"
        )
    op.drop_table("hospital_directory_events")
    with op.batch_alter_table("hospital_profiles") as batch:
        batch.drop_column("directory_published_at")
        batch.drop_column("directory_version")
        batch.drop_column("directory_draft")
