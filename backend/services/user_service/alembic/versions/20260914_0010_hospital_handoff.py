"""Bind browser handoff proofs to their intended portal."""

import sqlalchemy as sa
from alembic import op

revision = "20260914_0010"
down_revision = "20260914_0009"
branch_labels = None
depends_on = None


def upgrade():
    # Existing proofs remain onboarding proofs, never hospital proofs.
    op.add_column(
        "partner_handoffs",
        sa.Column("portal", sa.String(16), nullable=False, server_default="partner"),
    )


def downgrade():
    # A downgrade must not reinterpret an outstanding hospital proof as onboarding.
    op.execute(sa.text("DELETE FROM partner_handoffs WHERE portal != 'partner'"))
    op.drop_column("partner_handoffs", "portal")
