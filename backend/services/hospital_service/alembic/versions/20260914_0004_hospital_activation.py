"""Preserve approved hospital activation ownership and receipts."""

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects import postgresql

revision = "20260914_0004"
down_revision = "20260805_0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "hospital_profiles",
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "hospital_profiles",
        sa.Column("is_listable", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    with op.batch_alter_table("hospital_profiles") as batch:
        batch.alter_column("is_listable", existing_type=sa.Boolean(), server_default=sa.false())
    op.create_index("ix_hospital_profiles_owner_user_id", "hospital_profiles", ["owner_user_id"])
    op.create_index("ix_hospital_profiles_is_listable", "hospital_profiles", ["is_listable"])
    op.create_table(
        "professional_activation_receipts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
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


def downgrade():
    if context.is_offline_mode() or op.get_bind().scalar(
        sa.text(
            "SELECT (SELECT count(*) FROM professional_activation_receipts) + "
            "(SELECT count(*) FROM hospital_profiles WHERE owner_user_id IS NOT NULL OR is_listable = false)"
        )
    ):
        raise RuntimeError(
            "cannot discard hospital ownership or activation records; use a forward migration"
        )
    op.drop_table("professional_activation_receipts")
    op.drop_index("ix_hospital_profiles_owner_user_id", table_name="hospital_profiles")
    op.drop_index("ix_hospital_profiles_is_listable", table_name="hospital_profiles")
    with op.batch_alter_table("hospital_profiles") as batch:
        batch.drop_column("owner_user_id")
        batch.drop_column("is_listable")
