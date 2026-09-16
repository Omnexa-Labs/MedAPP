"""Version applications and preserve submission/review evidence.

Existing applications retain their status and document metadata. Legacy external
links are display-only and cannot satisfy the managed credential requirements.
"""

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects import postgresql

revision = "20260914_0002"
down_revision = "20260807_ts"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "partner_applications",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "partner_applications", sa.Column("practitioner_role", sa.String(16), nullable=True)
    )
    op.add_column(
        "partner_applications", sa.Column("professional_first_name", sa.String(255), nullable=True)
    )
    op.add_column(
        "partner_applications", sa.Column("professional_last_name", sa.String(255), nullable=True)
    )
    op.add_column(
        "partner_applications", sa.Column("attested_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "partner_applications", sa.Column("attestation_version", sa.String(64), nullable=True)
    )
    op.create_table(
        "application_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "application_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("partner_applications.id"),
            nullable=False,
        ),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("application_version", sa.Integer(), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
    )
    op.create_index(
        "ix_application_events_application_id", "application_events", ["application_id"]
    )


def downgrade():
    if context.is_offline_mode():
        raise RuntimeError("downgrade requires a live evidence-preservation check")
    connection = op.get_bind()
    if connection.scalar(sa.text("SELECT count(*) FROM application_events")) or connection.scalar(
        sa.text(
            "SELECT count(*) FROM partner_applications WHERE version <> 1 OR practitioner_role IS NOT NULL "
            "OR professional_first_name IS NOT NULL OR professional_last_name IS NOT NULL "
            "OR attested_at IS NOT NULL OR attestation_version IS NOT NULL"
        )
    ):
        raise RuntimeError(
            "cannot discard application identity or audit evidence; use a forward migration"
        )
    op.drop_index("ix_application_events_application_id", table_name="application_events")
    op.drop_table("application_events")
    for column in (
        "attestation_version",
        "attested_at",
        "professional_last_name",
        "professional_first_name",
        "practitioner_role",
        "version",
    ):
        op.drop_column("partner_applications", column)
