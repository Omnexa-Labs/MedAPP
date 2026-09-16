"""Single-use proofs for mobile to partner website onboarding."""

import sqlalchemy as sa
from alembic import op

revision = "20260914_0008"
down_revision = "20260913_0007"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "partner_handoffs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("token_hash", sa.String(64), unique=True, nullable=False),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("source_session_id", sa.Uuid(), nullable=False),
        sa.Column("password_version", sa.String(64), nullable=False),
        sa.Column("application_id", sa.Uuid(), nullable=True),
        sa.Column("return_uri", sa.String(512), nullable=False),
        sa.Column("return_state", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
    )
    for column in ("user_id", "expires_at"):
        op.create_index(f"ix_partner_handoffs_{column}", "partner_handoffs", [column])


def downgrade():
    op.drop_table("partner_handoffs")
