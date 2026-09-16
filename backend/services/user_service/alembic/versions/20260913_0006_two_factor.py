"""Authenticator enrollment and short-lived password-verified challenges."""
import sqlalchemy as sa
from alembic import op

revision = "20260913_0006"
down_revision = "20260913_0005"
branch_labels = None
depends_on = None


def timestamps():
    return [sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)]


def upgrade():
    op.create_table("two_factors", *timestamps(),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("secret_encrypted", sa.Text(), nullable=True),
        sa.Column("recovery_hashes", sa.JSON(), nullable=False),
        sa.Column("generation", sa.String(36), nullable=False),
        sa.Column("setup_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("setup_password_version", sa.String(64), nullable=True),
        sa.Column("last_step", sa.Integer(), nullable=True),
        sa.Column("failures", sa.Integer(), nullable=False),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True))
    op.create_table("two_factor_challenges", *timestamps(),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("generation", sa.String(36), nullable=False),
        sa.Column("password_version", sa.String(64), nullable=False),
        sa.Column("device_id", sa.String(64), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_two_factor_challenges_user_id", "two_factor_challenges", ["user_id"])


def downgrade():
    op.drop_index("ix_two_factor_challenges_user_id", table_name="two_factor_challenges")
    op.drop_table("two_factor_challenges")
    op.drop_table("two_factors")
