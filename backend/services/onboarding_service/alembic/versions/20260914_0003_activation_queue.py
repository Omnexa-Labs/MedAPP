"""Queue activation atomically with the review decision."""

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects import postgresql

revision = "20260914_0003"
down_revision = "20260914_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "application_activations",
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
            unique=True,
            nullable=False,
        ),
        sa.Column("approval_version", sa.Integer(), nullable=False),
        sa.Column("target", sa.String(32), nullable=False),
        sa.Column("state", sa.String(32), nullable=False),
        sa.Column("command_json", sa.JSON(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_error", sa.String(64), nullable=True),
        sa.Column("profile_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_application_activations_due", "application_activations", ["state", "next_attempt_at"]
    )


def downgrade():
    if context.is_offline_mode() or op.get_bind().scalar(
        sa.text("SELECT count(*) FROM application_activations")
    ):
        raise RuntimeError("cannot discard activation work or evidence; use a forward migration")
    op.drop_index("ix_application_activations_due", table_name="application_activations")
    op.drop_table("application_activations")
