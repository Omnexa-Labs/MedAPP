"""Transactional storage for bounded directory photos."""

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects.postgresql import UUID

revision = "20260915_0004"
down_revision = "20260915_0003"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "pharmacy_photos",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "pharmacy_id", UUID(as_uuid=True), sa.ForeignKey("pharmacy_profiles.id"), nullable=False
        ),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.CheckConstraint("length(content) <= 1048576", name="ck_pharmacy_photo_size"),
    )
    op.create_index("ix_pharmacy_photos_pharmacy_id", "pharmacy_photos", ["pharmacy_id"])


def downgrade():
    if context.is_offline_mode() or op.get_bind().scalar(
        sa.text("SELECT count(*) FROM pharmacy_photos")
    ):
        raise RuntimeError("cannot discard managed pharmacy photos; use a forward migration")
    op.drop_table("pharmacy_photos")
