"""Keep correction/refund evidence and exact new dispense-line provenance."""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import context, op

revision = "0006_sale_corrections"
down_revision = "0005_transaction_recovery"
branch_labels = None
depends_on = None


def timestamps():
    return [
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    ]


def upgrade():
    op.add_column(
        "sale_items", sa.Column("prescription_item_id", UUID(as_uuid=True), nullable=True)
    )
    op.create_foreign_key(
        "fk_sale_item_prescription_item",
        "sale_items",
        "prescription_items",
        ["prescription_item_id"],
        ["id"],
    )
    op.create_index("ix_sale_items_prescription_item_id", "sale_items", ["prescription_item_id"])
    op.create_table(
        "sale_corrections",
        *timestamps(),
        sa.Column("sale_id", UUID(as_uuid=True), sa.ForeignKey("sales.id"), nullable=False),
        sa.Column("number", sa.String(32), nullable=False, unique=True),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("reason", sa.String(255), nullable=False),
        sa.Column("credit_cents", sa.Integer(), nullable=False),
        sa.Column("actor_staff_id", UUID(as_uuid=True), nullable=False),
    )
    op.create_index("ix_sale_corrections_sale_id", "sale_corrections", ["sale_id"])
    op.create_table(
        "sale_correction_items",
        *timestamps(),
        sa.Column(
            "correction_id",
            UUID(as_uuid=True),
            sa.ForeignKey("sale_corrections.id"),
            nullable=False,
        ),
        sa.Column(
            "sale_item_id", UUID(as_uuid=True), sa.ForeignKey("sale_items.id"), nullable=False
        ),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("credit_cents", sa.Integer(), nullable=False),
    )
    for name in ("correction_id", "sale_item_id"):
        op.create_index("ix_sale_correction_items_" + name, "sale_correction_items", [name])
    op.create_table(
        "sale_refunds",
        *timestamps(),
        sa.Column("sale_id", UUID(as_uuid=True), sa.ForeignKey("sales.id"), nullable=False),
        sa.Column("number", sa.String(32), nullable=False, unique=True),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("payment_method", sa.String(16), nullable=False),
        sa.Column("payment_ref", sa.String(128), nullable=False),
        sa.Column("reason", sa.String(255), nullable=False),
        sa.Column("actor_staff_id", UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="recorded"),
        sa.Column("void_reason", sa.String(255), nullable=True),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("voided_by", UUID(as_uuid=True), nullable=True),
    )
    op.create_index("ix_sale_refunds_sale_id", "sale_refunds", ["sale_id"])


def downgrade():
    if context.is_offline_mode() or op.get_bind().scalar(
        sa.text(
            "SELECT (SELECT count(*) FROM sale_corrections) + (SELECT count(*) FROM sale_refunds) + "
            "(SELECT count(*) FROM sale_items WHERE prescription_item_id IS NOT NULL)"
        )
    ):
        raise RuntimeError(
            "cannot discard correction/refund evidence or dispense provenance; use a forward migration"
        )
    for table in ("sale_refunds", "sale_correction_items", "sale_corrections"):
        op.drop_table(table)
    op.drop_index("ix_sale_items_prescription_item_id", table_name="sale_items")
    op.drop_constraint("fk_sale_item_prescription_item", "sale_items", type_="foreignkey")
    op.drop_column("sale_items", "prescription_item_id")
