"""Prevent concurrent overlaps and track atomic reschedule replacements.

Existing overlaps make this migration fail; reconcile them explicitly before
deployment. No appointment is silently cancelled or deleted by the migration.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260913_0005"
down_revision = "20260805_0004"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    op.add_column("bookings", sa.Column("rescheduled_from_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_unique_constraint("uq_booking_rescheduled_from", "bookings", ["rescheduled_from_id"])
    op.create_check_constraint("ck_booking_positive_window", "bookings", "starts_at < ends_at")
    op.execute("""ALTER TABLE bookings ADD CONSTRAINT ex_booking_doctor_window
        EXCLUDE USING gist (doctor_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
        WHERE (status = 'booked')""")


def downgrade():
    # Preserve the replacement relation so a retry cannot create a second visit
    # after a downgrade/re-upgrade. Data needs an explicit operator migration.
    if op.get_bind().scalar(sa.text("SELECT EXISTS (SELECT 1 FROM bookings WHERE rescheduled_from_id IS NOT NULL)")):
        raise RuntimeError("Cannot downgrade while reschedule history exists")
    op.drop_constraint("ex_booking_doctor_window", "bookings")
    op.drop_constraint("ck_booking_positive_window", "bookings")
    op.drop_constraint("uq_booking_rescheduled_from", "bookings")
    op.drop_column("bookings", "rescheduled_from_id")
