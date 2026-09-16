"""Keep idempotent professional activation receipts."""

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects import postgresql

revision = "20260914_0002"
down_revision = "20260807_ts"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "professional_activation_receipts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("applicant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), nullable=False),
    )
    op.create_index(
        "ix_professional_activation_receipts_applicant_id",
        "professional_activation_receipts",
        ["applicant_id"],
    )


def downgrade():
    if context.is_offline_mode() or op.get_bind().scalar(
        sa.text("SELECT count(*) FROM professional_activation_receipts")
    ):
        raise RuntimeError("cannot discard activation receipts; use a forward migration")
    op.drop_index(
        "ix_professional_activation_receipts_applicant_id",
        table_name="professional_activation_receipts",
    )
    op.drop_table("professional_activation_receipts")
