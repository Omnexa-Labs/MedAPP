"""Verified provider identities and single-use, device-bound sign-in attempts."""
import sqlalchemy as sa
from alembic import op

revision = "20260913_0007"
down_revision = "20260913_0006"
branch_labels = None
depends_on = None


def timestamps():
    return [sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)]


def upgrade():
    op.create_table("provider_identities", *timestamps(),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(16), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.UniqueConstraint("provider", "subject", name="uq_provider_subject"),
        sa.UniqueConstraint("user_id", "provider", name="uq_user_provider"))
    op.create_index("ix_provider_identities_user_id", "provider_identities", ["user_id"])
    op.create_table("provider_attempts", *timestamps(),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("provider", sa.String(16), nullable=False),
        sa.Column("device_id", sa.String(64), nullable=False),
        sa.Column("nonce", sa.String(64), nullable=False),
        sa.Column("stage", sa.String(16), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("subject", sa.String(255), nullable=True),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("password_version", sa.String(64), nullable=True))
    for column in ("device_id", "expires_at", "user_id"):
        op.create_index(f"ix_provider_attempts_{column}", "provider_attempts", [column])


def downgrade():
    # Removing a live login method requires an explicit migration/recovery plan.
    if op.get_bind().execute(sa.text("SELECT 1 FROM provider_identities LIMIT 1")).first():
        raise RuntimeError("Disconnect provider identities before downgrading this migration.")
    op.drop_table("provider_attempts")
    op.drop_table("provider_identities")
