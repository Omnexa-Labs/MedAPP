"""Record approved pharmacy identities and permanent PMS deployment assignments."""

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects import postgresql

revision = "20260915_0002"
down_revision = "20260527_0001"
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
    with op.batch_alter_table("pharmacy_profiles") as batch:
        batch.alter_column(
            "license_number",
            existing_type=sa.String(128),
            type_=sa.String(255),
            existing_nullable=True,
        )
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
        "pharmacy_deployments",
        *timestamps(),
        sa.Column(
            "pharmacy_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("pharmacy_profiles.id"),
            unique=True,
            nullable=False,
        ),
        sa.Column("deployment_key", sa.String(64), unique=True, nullable=True),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("request_hash", sa.String(64), nullable=True),
    )
    op.create_table(
        "pharmacy_deployment_events",
        *timestamps(),
        sa.Column(
            "pharmacy_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("pharmacy_profiles.id"),
            nullable=False,
        ),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("details", sa.JSON, nullable=False),
    )
    op.create_index(
        "ix_pharmacy_deployment_events_pharmacy_id", "pharmacy_deployment_events", ["pharmacy_id"]
    )


def downgrade():
    if context.is_offline_mode() or op.get_bind().scalar(
        sa.text(
            "SELECT (SELECT count(*) FROM professional_activation_receipts) + "
            "(SELECT count(*) FROM pharmacy_deployments) + (SELECT count(*) FROM pharmacy_deployment_events) + "
            "(SELECT count(*) FROM pharmacy_profiles WHERE length(license_number) > 128)"
        )
    ):
        raise RuntimeError(
            "cannot discard pharmacy activation or deployment data; use a forward migration"
        )
    op.drop_table("pharmacy_deployment_events")
    op.drop_table("pharmacy_deployments")
    op.drop_table("professional_activation_receipts")
    with op.batch_alter_table("pharmacy_profiles") as batch:
        batch.alter_column(
            "license_number",
            existing_type=sa.String(255),
            type_=sa.String(128),
            existing_nullable=True,
        )
