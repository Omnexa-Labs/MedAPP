"""Track partial purchase receipts without inventing historical allocations."""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import context, op

revision = "0004_partial_receiving"
down_revision = "0003_inventory_revisions"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "purchase_orders", sa.Column("version", sa.Integer(), nullable=False, server_default="1")
    )
    op.add_column(
        "purchase_orders",
        sa.Column("receiving_reconciled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "purchase_orders", sa.Column("supplier_name_snapshot", sa.String(255), nullable=True)
    )
    op.add_column(
        "purchase_orders", sa.Column("cancellation_reason", sa.String(255), nullable=True)
    )
    op.alter_column("purchase_orders", "status", type_=sa.String(24), existing_type=sa.String(16))
    op.add_column(
        "purchase_order_items",
        sa.Column("quantity_received", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "purchase_order_items", sa.Column("drug_name_snapshot", sa.String(384), nullable=True)
    )
    op.add_column(
        "drug_batches", sa.Column("purchase_order_item_id", UUID(as_uuid=True), nullable=True)
    )
    op.add_column("drug_batches", sa.Column("delivery_reference", sa.String(64), nullable=True))
    op.create_foreign_key(
        "fk_batch_po_item",
        "drug_batches",
        "purchase_order_items",
        ["purchase_order_item_id"],
        ["id"],
    )
    op.create_index(
        "ix_drug_batches_purchase_order_item_id", "drug_batches", ["purchase_order_item_id"]
    )
    op.execute(
        "UPDATE purchase_orders SET receiving_reconciled=false WHERE status='received' "
        "OR EXISTS(SELECT 1 FROM drug_batches b WHERE b.purchase_order_id=purchase_orders.id)"
    )


def downgrade():
    if context.is_offline_mode() or op.get_bind().scalar(
        sa.text(
            "SELECT (SELECT count(*) FROM purchase_orders WHERE version<>1 OR supplier_name_snapshot IS NOT NULL "
            "OR cancellation_reason IS NOT NULL OR status='partially_received') + "
            "(SELECT count(*) FROM purchase_order_items WHERE quantity_received<>0 OR drug_name_snapshot IS NOT NULL) + "
            "(SELECT count(*) FROM drug_batches WHERE purchase_order_item_id IS NOT NULL OR delivery_reference IS NOT NULL)"
        )
    ):
        raise RuntimeError(
            "cannot discard purchase order or receipt evidence; use a forward migration"
        )
    op.drop_index("ix_drug_batches_purchase_order_item_id", table_name="drug_batches")
    op.drop_constraint("fk_batch_po_item", "drug_batches", type_="foreignkey")
    op.drop_column("drug_batches", "delivery_reference")
    op.drop_column("drug_batches", "purchase_order_item_id")
    op.drop_column("purchase_order_items", "drug_name_snapshot")
    op.drop_column("purchase_order_items", "quantity_received")
    op.alter_column("purchase_orders", "status", type_=sa.String(16), existing_type=sa.String(24))
    for column in (
        "cancellation_reason",
        "supplier_name_snapshot",
        "receiving_reconciled",
        "version",
    ):
        op.drop_column("purchase_orders", column)
