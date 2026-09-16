"""Retain sale notes and revisions for sale/Rx cancellation and dispensing."""

import sqlalchemy as sa

from alembic import context, op

revision = "0005_transaction_recovery"
down_revision = "0004_partial_receiving"
branch_labels = None
depends_on = None


def upgrade():
    for table in ("sales", "prescriptions"):
        op.add_column(table, sa.Column("version", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("sales", sa.Column("notes", sa.Text(), nullable=True))
    op.add_column("sales", sa.Column("void_reason", sa.String(255), nullable=True))
    op.add_column("prescriptions", sa.Column("cancellation_reason", sa.String(255), nullable=True))


def downgrade():
    if context.is_offline_mode() or op.get_bind().scalar(
        sa.text(
            "SELECT (SELECT count(*) FROM sales WHERE version<>1 OR notes IS NOT NULL OR void_reason IS NOT NULL) + "
            "(SELECT count(*) FROM prescriptions WHERE version<>1 OR cancellation_reason IS NOT NULL)"
        )
    ):
        raise RuntimeError("cannot discard transaction evidence; use a forward migration")
    op.drop_column("prescriptions", "cancellation_reason")
    op.drop_column("sales", "void_reason")
    op.drop_column("sales", "notes")
    for table in ("sales", "prescriptions"):
        op.drop_column(table, "version")
