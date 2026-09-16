"""Bind pharmacy handoffs to a single pharmacy and PMS deployment."""

import sqlalchemy as sa
from alembic import op

revision = "20260915_0011"
down_revision = "20260914_0010"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("partner_handoffs") as batch:
        batch.add_column(sa.Column("pharmacy_id", sa.Uuid(), nullable=True))
        batch.add_column(sa.Column("deployment_key", sa.String(64), nullable=True))
        batch.create_check_constraint(
            "ck_handoff_pharmacy_target",
            "(portal = 'pharmacy' AND pharmacy_id IS NOT NULL AND deployment_key IS NOT NULL) OR "
            "(portal != 'pharmacy' AND pharmacy_id IS NULL AND deployment_key IS NULL)",
        )


def downgrade():
    # Expire transient pharmacy proofs before removing their target binding.
    # Preserve existing partner/hospital proofs and all account/business records.
    op.execute(sa.text("DELETE FROM partner_handoffs WHERE portal = 'pharmacy'"))
    with op.batch_alter_table("partner_handoffs") as batch:
        batch.drop_constraint("ck_handoff_pharmacy_target", type_="check")
        batch.drop_column("deployment_key")
        batch.drop_column("pharmacy_id")
