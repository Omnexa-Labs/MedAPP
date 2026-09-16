"""Hospital invitations, versioned access changes and durable audit history."""

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects.postgresql import UUID

revision = "20260915_0003"
down_revision = "20260914_0002"
branch_labels = None
depends_on = None


def base_columns():
    return [
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenant_registry.id"), nullable=False
        ),
    ]


def upgrade():
    op.add_column(
        "hms_staff_roles", sa.Column("version", sa.Integer(), nullable=False, server_default="1")
    )
    op.create_table(
        "staff_invitations",
        *base_columns(),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("hms_role", sa.String(32), nullable=False),
        sa.Column("staff_data", sa.JSON(), nullable=False),
        sa.Column("created_by", UUID(as_uuid=True), nullable=False),
        sa.Column("creator_version", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("cancelled_at", sa.DateTime(timezone=True)),
        sa.Column("accepted_at", sa.DateTime(timezone=True)),
        sa.Column("accepted_by", UUID(as_uuid=True)),
        sa.Column("membership_id", UUID(as_uuid=True)),
        sa.Column("staff_id", UUID(as_uuid=True)),
    )
    op.create_table(
        "staff_access_events",
        *base_columns(),
        sa.Column("actor_id", UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
    )
    for table in ["staff_invitations", "staff_access_events"]:
        op.create_index(f"ix_{table}_tenant_created", table, ["tenant_id", "created_at"])


def downgrade():
    if context.is_offline_mode() or any(
        op.get_bind().scalar(sa.text(f"SELECT count(*) FROM {table}"))
        for table in ["staff_invitations", "staff_access_events"]
    ):
        raise RuntimeError(
            "cannot discard staff invitation/access history; use a forward migration"
        )
    op.drop_table("staff_access_events")
    op.drop_table("staff_invitations")
    op.drop_column("hms_staff_roles", "version")
