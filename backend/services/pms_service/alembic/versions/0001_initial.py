"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-20
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _ts():
    return (
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def upgrade() -> None:
    op.create_table(
        "pharmacy_profile",
        *_ts(),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(64), nullable=False, unique=True),
        sa.Column("license_no", sa.String(64), nullable=True),
        sa.Column("address", sa.String(512), nullable=True),
        sa.Column("city", sa.String(128), nullable=True),
        sa.Column("region", sa.String(128), nullable=True),
        sa.Column("country", sa.String(2), nullable=False, server_default="GH"),
        sa.Column("phone", sa.String(32), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="GHS"),
        sa.Column("medapp_partner_id", sa.String(128), nullable=True),
    )

    op.create_table(
        "staff",
        *_ts(),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(32), nullable=True),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("email", name="uq_staff_email"),
    )
    op.create_index("ix_staff_role", "staff", ["role"])
    op.create_index("ix_staff_is_active", "staff", ["is_active"])

    op.create_table(
        "suppliers",
        *_ts(),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("contact_person", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(32), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("address", sa.String(512), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
    )
    op.create_index("ix_suppliers_name", "suppliers", ["name"])

    op.create_table(
        "drugs",
        *_ts(),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("brand_name", sa.String(255), nullable=True),
        sa.Column("sku", sa.String(64), nullable=True, unique=True),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("form", sa.String(64), nullable=False),
        sa.Column("strength", sa.String(64), nullable=False),
        sa.Column("unit", sa.String(32), nullable=False),
        sa.Column("reorder_level", sa.Integer, nullable=False, server_default="10"),
        sa.Column("default_selling_price_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="GHS"),
        sa.Column("requires_prescription", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("notes", sa.Text, nullable=True),
    )
    op.create_index("ix_drugs_name", "drugs", ["name"])
    op.create_index("ix_drugs_category", "drugs", ["category"])

    op.create_table(
        "purchase_orders",
        *_ts(),
        sa.Column("po_number", sa.String(32), nullable=False, unique=True),
        sa.Column("supplier_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="draft"),
        sa.Column("expected_at", sa.Date, nullable=True),
        sa.Column("total_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="GHS"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_by_staff_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index("ix_purchase_orders_supplier_id", "purchase_orders", ["supplier_id"])
    op.create_index("ix_purchase_orders_status", "purchase_orders", ["status"])

    op.create_table(
        "purchase_order_items",
        *_ts(),
        sa.Column("purchase_order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("purchase_orders.id"), nullable=False),
        sa.Column("drug_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("quantity", sa.Integer, nullable=False),
        sa.Column("unit_cost_cents", sa.Integer, nullable=False, server_default="0"),
    )
    op.create_index("ix_purchase_order_items_po", "purchase_order_items", ["purchase_order_id"])

    op.create_table(
        "drug_batches",
        *_ts(),
        sa.Column("drug_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("drugs.id"), nullable=False),
        sa.Column("supplier_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("suppliers.id"), nullable=True),
        sa.Column("purchase_order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("purchase_orders.id"), nullable=True),
        sa.Column("batch_number", sa.String(64), nullable=False),
        sa.Column("quantity_received", sa.Integer, nullable=False),
        sa.Column("quantity_on_hand", sa.Integer, nullable=False),
        sa.Column("unit_cost_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("selling_price_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="GHS"),
        sa.Column("received_at", sa.Date, nullable=False),
        sa.Column("expiry_date", sa.Date, nullable=False),
    )
    op.create_index("ix_drug_batches_drug_id", "drug_batches", ["drug_id"])
    op.create_index("ix_drug_batches_expiry_date", "drug_batches", ["expiry_date"])

    op.create_table(
        "stock_movements",
        *_ts(),
        sa.Column("drug_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("batch_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("delta", sa.Integer, nullable=False),
        sa.Column("reason", sa.String(32), nullable=False),
        sa.Column("ref_type", sa.String(32), nullable=True),
        sa.Column("ref_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_staff_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("note", sa.String(255), nullable=True),
    )
    op.create_index("ix_stock_movements_drug_id", "stock_movements", ["drug_id"])
    op.create_index("ix_stock_movements_reason", "stock_movements", ["reason"])

    op.create_table(
        "customers",
        *_ts(),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(32), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("date_of_birth", sa.Date, nullable=True),
        sa.Column("medapp_user_id", sa.String(64), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
    )
    op.create_index("ix_customers_full_name", "customers", ["full_name"])
    op.create_index("ix_customers_phone", "customers", ["phone"])
    op.create_index("ix_customers_medapp_user_id", "customers", ["medapp_user_id"])

    op.create_table(
        "prescriptions",
        *_ts(),
        sa.Column("rx_number", sa.String(32), nullable=False, unique=True),
        sa.Column("source", sa.String(16), nullable=False, server_default="walk_in"),
        sa.Column("external_ref", sa.String(128), nullable=True),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("customers.id"), nullable=True),
        sa.Column("prescriber_name", sa.String(255), nullable=True),
        sa.Column("prescriber_license", sa.String(64), nullable=True),
        sa.Column("status", sa.String(24), nullable=False, server_default="pending"),
        sa.Column("notes", sa.Text, nullable=True),
    )
    op.create_index("ix_prescriptions_source", "prescriptions", ["source"])
    op.create_index("ix_prescriptions_status", "prescriptions", ["status"])
    op.create_index("ix_prescriptions_external_ref", "prescriptions", ["external_ref"])
    op.create_index("ix_prescriptions_customer_id", "prescriptions", ["customer_id"])

    op.create_table(
        "prescription_items",
        *_ts(),
        sa.Column("prescription_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("prescriptions.id"), nullable=False),
        sa.Column("drug_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("drug_name_snapshot", sa.String(255), nullable=False),
        sa.Column("quantity_prescribed", sa.Integer, nullable=False),
        sa.Column("quantity_dispensed", sa.Integer, nullable=False, server_default="0"),
        sa.Column("dosage_instructions", sa.String(512), nullable=True),
    )
    op.create_index("ix_prescription_items_rx", "prescription_items", ["prescription_id"])

    op.create_table(
        "sales",
        *_ts(),
        sa.Column("sale_number", sa.String(32), nullable=False, unique=True),
        sa.Column("prescription_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("prescriptions.id"), nullable=True),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("customers.id"), nullable=True),
        sa.Column("cashier_staff_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("subtotal_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("discount_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("tax_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="GHS"),
        sa.Column("payment_method", sa.String(16), nullable=False, server_default="cash"),
        sa.Column("payment_ref", sa.String(128), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="completed"),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_sales_prescription_id", "sales", ["prescription_id"])
    op.create_index("ix_sales_status", "sales", ["status"])

    op.create_table(
        "sale_items",
        *_ts(),
        sa.Column("sale_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sales.id"), nullable=False),
        sa.Column("drug_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("drug_batch_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("drug_name_snapshot", sa.String(255), nullable=False),
        sa.Column("quantity", sa.Integer, nullable=False),
        sa.Column("unit_price_cents", sa.Integer, nullable=False),
        sa.Column("line_total_cents", sa.Integer, nullable=False),
    )
    op.create_index("ix_sale_items_sale_id", "sale_items", ["sale_id"])

    op.create_table(
        "audit_log",
        *_ts(),
        sa.Column("actor_staff_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("entity_type", sa.String(64), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("payload_json", postgresql.JSONB, nullable=True),
    )
    op.create_index("ix_audit_log_actor_staff_id", "audit_log", ["actor_staff_id"])
    op.create_index("ix_audit_log_action", "audit_log", ["action"])
    op.create_index("ix_audit_log_entity_type", "audit_log", ["entity_type"])


def downgrade() -> None:
    for tbl in [
        "audit_log",
        "sale_items",
        "sales",
        "prescription_items",
        "prescriptions",
        "customers",
        "stock_movements",
        "drug_batches",
        "purchase_order_items",
        "purchase_orders",
        "drugs",
        "suppliers",
        "staff",
        "pharmacy_profile",
    ]:
        op.drop_table(tbl)
