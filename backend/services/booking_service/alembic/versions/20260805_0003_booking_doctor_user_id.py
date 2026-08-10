"""add doctor_user_id to bookings (practitioner authorization key)

Revision ID: 20260805_0003
Revises: 20260803_0002
Create Date: 2026-08-05

`doctor_user_id` — the **user_service user id** of the clinician on the
booking, denormalised from doctor_service at creation time.

WHY A COLUMN AND NOT A LOOKUP
-----------------------------
`bookings.doctor_id` holds a doctor_service PROFILE id, which lives in a
different id space from the `sub` claim of a JWT (a user_service USER id). A
practitioner read therefore had nothing local to authorise against, and the
previous `?doctor_id=` query parameter authorised on a value supplied by the
client — an IDOR over other clinicians' patients. This column gives the read
path a value it can compare to `principal.subject` without a network call, so
the authorization decision cannot time out, and cannot be tempted into failing
open under load. The rejected alternatives (resolve on every read; carry the
profile id as a JWT claim) are argued in
`app/services/doctor_directory.py`.

WHY NULLABLE — AND WHY NULL IS NOT "ALLOW"
------------------------------------------
Unlike `mode` in revision 20260803_0002, this column gets **no
`server_default`** and stays NULLABLE, because there is no value that is
correct for an existing row. A default would be a fabricated identity, and the
one thing worse than a doctor not seeing a booking is the wrong doctor seeing
it. NOT NULL is also not available: this migration runs inside
booking_service's own database and has no way to reach doctor_service to learn
the answer, so it cannot fill the column.

Consequently `NULL` means **DENY** everywhere it is read
(`app/services/booking_service.py` filters `doctor_user_id == subject`, which
in SQL is never true for NULL — the fail-closed behaviour is a property of the
comparison, and there is a test pinning it). Pre-existing bookings are simply
absent from the practitioner schedule until repaired by
`scripts/backfill_booking_doctor_user_id.py`, which resolves each distinct
`doctor_id` through doctor_service and fills only the NULLs. Run it right
after this migration.

Both the column and its index are guarded by an inspector check, so a re-run,
or a run against a database created from `Base.metadata.create_all` where the
column already exists, is a no-op rather than a `DuplicateColumn` — the trap
that bit `user_service` revision 0003.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260805_0003"
down_revision = "20260803_0002"
branch_labels = None
depends_on = None

TABLE = "bookings"
COLUMN = "doctor_user_id"
INDEX = "ix_bookings_doctor_user_id"


def _columns() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(TABLE)}


def _indexes() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {index["name"] for index in inspector.get_indexes(TABLE)}


def upgrade() -> None:
    if COLUMN not in _columns():
        op.add_column(
            TABLE,
            sa.Column(COLUMN, postgresql.UUID(as_uuid=True), nullable=True),
        )
    # Indexed because the practitioner schedule query filters on it on every
    # read; without the index that endpoint is a full scan of every booking in
    # the platform.
    if INDEX not in _indexes():
        op.create_index(INDEX, TABLE, [COLUMN])


def downgrade() -> None:
    if INDEX in _indexes():
        op.drop_index(INDEX, table_name=TABLE)
    if COLUMN in _columns():
        op.drop_column(TABLE, COLUMN)
