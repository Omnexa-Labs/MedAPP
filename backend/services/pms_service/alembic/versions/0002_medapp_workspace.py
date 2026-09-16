"""Bind a fresh PMS deployment to its approved MedApp owner."""

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects import postgresql

revision = "0002_medapp_workspace"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def timestamps():
    return [
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    ]


def upgrade():
    with op.batch_alter_table("pharmacy_profile") as batch:
        for column, before, after in [
            ("license_no", 64, 255),
            ("country", 2, 128),
            ("phone", 32, 64),
        ]:
            batch.alter_column(
                column,
                existing_type=sa.String(before),
                type_=sa.String(after),
                existing_nullable=column != "country",
            )
    with op.batch_alter_table("staff") as batch:
        batch.alter_column("password_hash", existing_type=sa.String(255), nullable=True)
    op.create_table(
        "professional_activation_receipts",
        *timestamps(),
        sa.Column("applicant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), nullable=False),
    )
    op.create_index(
        "ix_professional_activation_receipts_applicant_id",
        "professional_activation_receipts",
        ["applicant_id"],
    )
    op.create_table(
        "medapp_workspace",
        *timestamps(),
        sa.Column("singleton", sa.Integer, unique=True, nullable=False),
        sa.CheckConstraint("singleton = 1", name="ck_medapp_workspace_singleton"),
        sa.Column(
            "pharmacy_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("pharmacy_profile.id"),
            unique=True,
            nullable=False,
        ),
        sa.Column("application_id", postgresql.UUID(as_uuid=True), unique=True, nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("deployment_key", sa.String(64), unique=True, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
    )
    op.create_table(
        "medapp_memberships",
        *timestamps(),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), unique=True, nullable=False),
        sa.Column(
            "staff_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("staff.id"),
            unique=True,
            nullable=True,
        ),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
    )


def downgrade():
    if context.is_offline_mode() or op.get_bind().scalar(
        sa.text(
            "SELECT (SELECT count(*) FROM professional_activation_receipts) + (SELECT count(*) FROM medapp_workspace) + "
            "(SELECT count(*) FROM medapp_memberships) + (SELECT count(*) FROM staff WHERE password_hash IS NULL) + "
            "(SELECT count(*) FROM pharmacy_profile WHERE length(license_no) > 64 OR length(country) > 2 OR length(phone) > 32)"
        )
    ):
        raise RuntimeError(
            "cannot discard MedApp ownership or pharmacy data; use a forward migration"
        )
    op.drop_table("medapp_memberships")
    op.drop_table("medapp_workspace")
    op.drop_table("professional_activation_receipts")
    with op.batch_alter_table("staff") as batch:
        batch.alter_column("password_hash", existing_type=sa.String(255), nullable=False)
    with op.batch_alter_table("pharmacy_profile") as batch:
        for column, before, after in [
            ("license_no", 255, 64),
            ("country", 128, 2),
            ("phone", 64, 32),
        ]:
            batch.alter_column(
                column,
                existing_type=sa.String(before),
                type_=sa.String(after),
                existing_nullable=column != "country",
            )
