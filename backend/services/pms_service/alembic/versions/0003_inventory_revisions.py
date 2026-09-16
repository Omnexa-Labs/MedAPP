"""Version inventory edits and retain replayable mutation receipts."""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import context, op

revision = "0003_inventory_revisions"
down_revision = "0002_medapp_workspace"
branch_labels = None
depends_on = None


def upgrade():
    for table in ("drugs", "drug_batches"):
        op.add_column(table, sa.Column("version", sa.Integer(), nullable=False, server_default="1"))
    op.create_table(
        "inventory_requests",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("actor_staff_id", UUID(as_uuid=True), nullable=False),
        sa.Column("operation", sa.String(100), nullable=False),
        sa.Column("request", JSONB(), nullable=False),
        sa.Column("result", JSONB(), nullable=True),
    )


def downgrade():
    if context.is_offline_mode() or op.get_bind().scalar(
        sa.text(
            "SELECT (SELECT count(*) FROM inventory_requests) + "
            "(SELECT count(*) FROM drugs WHERE version <> 1) + "
            "(SELECT count(*) FROM drug_batches WHERE version <> 1)"
        )
    ):
        raise RuntimeError(
            "cannot discard inventory revisions or request receipts; use a forward migration"
        )
    op.drop_table("inventory_requests")
    op.drop_column("drug_batches", "version")
    op.drop_column("drugs", "version")
