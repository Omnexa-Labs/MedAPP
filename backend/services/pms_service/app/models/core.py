"""All PMS SQLAlchemy models in a single module.

Kept together because every entity here belongs to the same single-pharmacy
deployment and they cross-reference often (drug -> batch -> sale_item).
Importing this module registers tables on shared.db.Base.metadata.
"""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from shared.db import Base, TimestampMixin
from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

# Use JSONB on Postgres, plain JSON on SQLite (for tests).
JsonType = JSON().with_variant(JSONB(), "postgresql")

# -- profile + identity ------------------------------------------------------


class PharmacyProfile(Base, TimestampMixin):
    """Singleton row describing the pharmacy this deployment serves."""

    __tablename__ = "pharmacy_profile"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    license_no: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address: Mapped[str | None] = mapped_column(String(512), nullable=True)
    city: Mapped[str | None] = mapped_column(String(128), nullable=True)
    region: Mapped[str | None] = mapped_column(String(128), nullable=True)
    country: Mapped[str] = mapped_column(String(128), nullable=False, default="GH")
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="GHS")
    medapp_partner_id: Mapped[str | None] = mapped_column(String(128), nullable=True)


class Staff(Base, TimestampMixin):
    __tablename__ = "staff"

    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)


# -- suppliers + purchasing --------------------------------------------------


class Supplier(Base, TimestampMixin):
    __tablename__ = "suppliers"

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    contact_person: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address: Mapped[str | None] = mapped_column(String(512), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class PurchaseOrder(Base, TimestampMixin):
    __tablename__ = "purchase_orders"

    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    receiving_reconciled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    supplier_name_snapshot: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    po_number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    supplier_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="draft", index=True
    )  # draft|sent|partially_received|received|cancelled
    expected_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    total_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="GHS")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_staff_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)


class PurchaseOrderItem(Base, TimestampMixin):
    __tablename__ = "purchase_order_items"

    purchase_order_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("purchase_orders.id"), nullable=False, index=True
    )
    drug_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_received: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    drug_name_snapshot: Mapped[str | None] = mapped_column(String(384), nullable=True)
    unit_cost_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


# -- inventory ---------------------------------------------------------------


class Drug(Base, TimestampMixin):
    __tablename__ = "drugs"

    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    brand_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sku: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    category: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    form: Mapped[str] = mapped_column(String(64), nullable=False)
    strength: Mapped[str] = mapped_column(String(64), nullable=False)
    unit: Mapped[str] = mapped_column(String(32), nullable=False)
    reorder_level: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    default_selling_price_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="GHS")
    requires_prescription: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class DrugBatch(Base, TimestampMixin):
    __tablename__ = "drug_batches"

    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    drug_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("drugs.id"), nullable=False, index=True
    )
    supplier_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=True
    )
    purchase_order_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("purchase_orders.id"), nullable=True
    )
    purchase_order_item_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("purchase_order_items.id"), nullable=True, index=True
    )
    delivery_reference: Mapped[str | None] = mapped_column(String(64), nullable=True)
    batch_number: Mapped[str] = mapped_column(String(64), nullable=False)
    quantity_received: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_on_hand: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_cost_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    selling_price_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="GHS")
    received_at: Mapped[date] = mapped_column(Date, nullable=False)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)


class StockMovement(Base, TimestampMixin):
    """Append-only ledger of every stock change. Sum gives current quantity."""

    __tablename__ = "stock_movements"

    drug_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    batch_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    delta: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(
        String(32), nullable=False, index=True
    )  # receive|dispense|sale|adjust|expire|return
    ref_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    ref_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    actor_staff_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)


# -- customers + prescriptions -----------------------------------------------


class Customer(Base, TimestampMixin):
    __tablename__ = "customers"

    full_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    medapp_user_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class Prescription(Base, TimestampMixin):
    __tablename__ = "prescriptions"
    __table_args__ = (
        Index(
            "uq_prescriptions_medapp_external",
            "external_ref",
            unique=True,
            postgresql_where=text("source = 'medapp' AND external_ref IS NOT NULL"),
            sqlite_where=text("source = 'medapp' AND external_ref IS NOT NULL"),
        ),
    )

    medapp_patient_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    sync_sequence: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    ingest_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    valid_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    cancellation_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    rx_number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    source: Mapped[str] = mapped_column(
        String(16), nullable=False, default="walk_in", index=True
    )  # walk_in|medapp|internal
    external_ref: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    customer_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("customers.id"), nullable=True, index=True
    )
    prescriber_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    prescriber_license: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="pending", index=True
    )  # pending|partially_dispensed|dispensed|cancelled
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class PrescriptionItem(Base, TimestampMixin):
    __tablename__ = "prescription_items"

    prescription_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("prescriptions.id"), nullable=False, index=True
    )
    drug_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    drug_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity_prescribed: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_dispensed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    dosage_instructions: Mapped[str | None] = mapped_column(String(512), nullable=True)


# -- sales (POS + dispensing both record into Sale) --------------------------


class Sale(Base, TimestampMixin):
    __tablename__ = "sales"

    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    void_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    sale_number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    prescription_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("prescriptions.id"), nullable=True, index=True
    )
    customer_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("customers.id"), nullable=True
    )
    cashier_staff_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    subtotal_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    discount_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tax_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="GHS")
    payment_method: Mapped[str] = mapped_column(
        String(16), nullable=False, default="cash"
    )  # cash|card|mobile_money|insurance
    payment_ref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="completed", index=True
    )  # completed|voided
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SaleItem(Base, TimestampMixin):
    __tablename__ = "sale_items"

    sale_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("sales.id"), nullable=False, index=True
    )
    prescription_item_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("prescription_items.id"), nullable=True, index=True
    )
    drug_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    drug_batch_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    drug_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    line_total_cents: Mapped[int] = mapped_column(Integer, nullable=False)


class SaleCorrection(Base, TimestampMixin):
    __tablename__ = "sale_corrections"

    sale_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("sales.id"), index=True)
    number: Mapped[str] = mapped_column(String(32), unique=True)
    kind: Mapped[str] = mapped_column(String(24))  # not_collected | customer_return
    reason: Mapped[str] = mapped_column(String(255))
    credit_cents: Mapped[int] = mapped_column(Integer)
    actor_staff_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True))


class SaleCorrectionItem(Base, TimestampMixin):
    __tablename__ = "sale_correction_items"

    correction_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("sale_corrections.id"), index=True
    )
    sale_item_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("sale_items.id"), index=True
    )
    quantity: Mapped[int] = mapped_column(Integer)
    credit_cents: Mapped[int] = mapped_column(Integer)


class SaleRefund(Base, TimestampMixin):
    __tablename__ = "sale_refunds"

    sale_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("sales.id"), index=True)
    number: Mapped[str] = mapped_column(String(32), unique=True)
    amount_cents: Mapped[int] = mapped_column(Integer)
    payment_method: Mapped[str] = mapped_column(String(16))
    payment_ref: Mapped[str] = mapped_column(String(128))
    reason: Mapped[str] = mapped_column(String(255))
    actor_staff_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True))
    status: Mapped[str] = mapped_column(String(16), default="recorded", server_default="recorded")
    void_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)


# -- audit -------------------------------------------------------------------


class AuditLog(Base, TimestampMixin):
    __tablename__ = "audit_log"

    actor_staff_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    payload_json: Mapped[dict | None] = mapped_column(JsonType, nullable=True)


class InventoryRequest(Base, TimestampMixin):
    """Committed results let a caller safely retry the same stock operation."""

    __tablename__ = "inventory_requests"
    actor_staff_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    operation: Mapped[str] = mapped_column(String(100), nullable=False)
    request: Mapped[dict] = mapped_column(JsonType, nullable=False)
    result: Mapped[dict | None] = mapped_column(JsonType, nullable=True)
