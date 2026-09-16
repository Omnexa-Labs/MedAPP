"""Keep unpublished pharmacy edits separate from the patient directory."""

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects.postgresql import UUID

revision = "20260915_0003"
down_revision = "20260915_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "pharmacy_profiles",
        sa.Column("services_offered", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.add_column(
        "pharmacy_profiles", sa.Column("head_pharmacist_name", sa.String(255), nullable=True)
    )
    op.add_column(
        "pharmacy_profiles", sa.Column("head_pharmacist_bio", sa.String(1000), nullable=True)
    )
    op.add_column("pharmacy_profiles", sa.Column("directory_draft", sa.JSON(), nullable=True))
    op.add_column(
        "pharmacy_profiles",
        sa.Column("directory_version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "pharmacy_profiles",
        sa.Column("directory_published_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "pharmacy_directory_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "pharmacy_id", UUID(as_uuid=True), sa.ForeignKey("pharmacy_profiles.id"), nullable=False
        ),
        sa.Column("actor_id", UUID(as_uuid=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("changed_fields", sa.JSON(), nullable=False),
        sa.Column("before", sa.JSON(), nullable=False),
        sa.Column("after", sa.JSON(), nullable=False),
        sa.UniqueConstraint("pharmacy_id", "version", name="uq_pharmacy_directory_event_version"),
    )


def downgrade():
    if context.is_offline_mode() or op.get_bind().scalar(
        sa.text(
            "SELECT (SELECT count(*) FROM pharmacy_directory_events) + "
            "(SELECT count(*) FROM pharmacy_profiles WHERE directory_draft IS NOT NULL "
            "OR directory_version <> 1 OR directory_published_at IS NOT NULL OR CAST(services_offered AS TEXT) <> '[]' OR head_pharmacist_name IS NOT NULL OR head_pharmacist_bio IS NOT NULL)"
        )
    ):
        raise RuntimeError(
            "cannot discard pharmacy profile drafts or publication history; use a forward migration"
        )
    op.drop_table("pharmacy_directory_events")
    with op.batch_alter_table("pharmacy_profiles") as batch:
        batch.drop_column("directory_published_at")
        batch.drop_column("directory_version")
        batch.drop_column("directory_draft")
        batch.drop_column("services_offered")
        batch.drop_column("head_pharmacist_name")
        batch.drop_column("head_pharmacist_bio")
