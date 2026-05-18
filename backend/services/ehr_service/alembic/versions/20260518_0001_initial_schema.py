"""initial schema for ehr_service

Revision ID: 20260518_0001
Revises:
Create Date: 2026-05-18 00:01:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260518_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "patients",
        sa.Column("id", sa.UUID(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=True),
        sa.UniqueConstraint("user_id", name="uq_patients_user_id"),
    )
    op.create_index("ix_patients_user_id", "patients", ["user_id"])

    op.create_table(
        "vitals",
        sa.Column("id", sa.UUID(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("patient_id", sa.UUID(), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("recorded_by_user_id", sa.UUID(), nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("value", sa.String(length=128), nullable=False),
        sa.Column("unit", sa.String(length=32), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
    )
    op.create_index("ix_vitals_patient_id", "vitals", ["patient_id"])
    op.create_index("ix_vitals_recorded_by_user_id", "vitals", ["recorded_by_user_id"])
    op.create_index("ix_vitals_kind", "vitals", ["kind"])
    op.create_index("ix_vitals_recorded_at", "vitals", ["recorded_at"])

    op.create_table(
        "consents",
        sa.Column("id", sa.UUID(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("patient_id", sa.UUID(), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("doctor_user_id", sa.UUID(), nullable=False),
        sa.Column("scope", sa.String(length=64), nullable=False),
        sa.Column("granted_by_user_id", sa.UUID(), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by_user_id", sa.UUID(), nullable=True),
        sa.UniqueConstraint("patient_id", "doctor_user_id", "scope", name="uq_patient_doctor_scope"),
    )
    op.create_index("ix_consents_patient_id", "consents", ["patient_id"])
    op.create_index("ix_consents_doctor_user_id", "consents", ["doctor_user_id"])
    op.create_index("ix_consents_revoked_at", "consents", ["revoked_at"])

    op.create_table(
        "access_audit",
        sa.Column("id", sa.UUID(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accessor_user_id", sa.UUID(), nullable=False),
        sa.Column("patient_id", sa.UUID(), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("resource", sa.String(length=64), nullable=False),
        sa.Column("reason", sa.String(length=255), nullable=False),
    )
    op.create_index("ix_access_audit_accessor_user_id", "access_audit", ["accessor_user_id"])
    op.create_index("ix_access_audit_patient_id", "access_audit", ["patient_id"])
    op.create_index("ix_access_audit_resource", "access_audit", ["resource"])


def downgrade() -> None:
    op.drop_table("access_audit")
    op.drop_table("consents")
    op.drop_table("vitals")
    op.drop_table("patients")