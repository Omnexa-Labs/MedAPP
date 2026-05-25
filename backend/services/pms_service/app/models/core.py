"""All PMS SQLAlchemy models in a single module.

Kept together because every entity here belongs to the same single-pharmacy
deployment and they cross-reference often (drug -> batch -> sale_item).
Importing this module registers tables on shared.db.Base.metadata.
"""
from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID

# Use JSONB on Postgres, plain JSON on SQLite (for tests).
JsonType = JSON().with_variant(JSONB(), "postgresql")
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base, TimestampMixin


# -- profile + identity ------------------------------------------------------


class PharmacyProfile(Base, TimestampMixin):
    """Singleton row describing the pharmacy this deployment serves."""

    __tablename__ = "pharmacy_profile"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    license_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    address: Mapped[str | None] = mapped_column(String(512), nullable=True)
    city: Mapped[str | None] = mapped_column(String(128), nullable=True)
    region: Mapped[str | None] = mapped_column(String(128), nullable=True)
    country: Mapped[str] = mapped_column(String(2), nullable=False, default="GH")
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="GHS")
    medapp_partner_id: Mapped[str | None] = mapped_column(String(128), nullable=True)


class Staff(Base, TimestampMixin):
    __tablename__ = "staff"

    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
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

    po_number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    supplier_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="draft", index=True
    )  # draft|sent|received|cancelled
    expected_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    total_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="GHS")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_staff_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True
    )


class PurchaseOrderItem(Base, TimestampMixin):
    __tablename__ = "purchase_order_items"

    purchase_order_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("purchase_orders.id"), nullable=False, index=True
    )
    drug_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_cost_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


# -- inventory ---------------------------------------------------------------


class Drug(Base, TimestampMixin):
    __tablename__ = "drugs"

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

    drug_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("drugs.id"), nullable=False, index=True
    )
    supplier_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=True
    )
    purchase_order_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("purchase_orders.id"), nullable=True
    )
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
    drug_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    drug_batch_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    drug_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    line_total_cents: Mapped[int] = mapped_column(Integer, nullable=False)


# -- audit -------------------------------------------------------------------


class AuditLog(Base, TimestampMixin):
    __tablename__ = "audit_log"

    actor_staff_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    payload_json: Mapped[dict | None] = mapped_column(JsonType, nullable=True)
