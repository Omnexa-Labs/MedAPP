"""add consultation mode and telemedicine room to bookings

Revision ID: 20260803_0002
Revises: 20260517_0001
Create Date: 2026-08-03

Two columns:

`mode` — the consultation modality the patient picked (`in_person` | `video`).
NOT NULL with `server_default='in_person'`, which is what makes this safe to
run against `medapp_pgdata`, where real bookings already exist. The
server_default is kept on the column (not dropped after the backfill) so a
writer that predates the model change still inserts a legal row rather than
failing on a NOT NULL violation.

**What the backfill asserts, explicitly:** every booking created before this
column existed was an in-person appointment. That is an assertion about
history, so it is worth defending. It is safe because the client had no field
in which to express a mode and the server never provisioned a room, so no
pre-existing row can have a telemedicine session behind it — there is nothing
that could make one of them genuinely video. And the two possible mistakes are
not symmetric: mislabelling a video booking "in person" tells a patient to
travel, which they discover and can correct by calling the clinic; mislabelling
an in-person booking "video" tells them to stay home and wait for a link that
will never arrive, and they miss the appointment. `in_person` is also the value
that renders no video affordance at all, so a backfilled row cannot produce a
dead "Join video call" button.

`room_id` — nullable UUID, no foreign key: the room is a row in
telemedicine_service's own database, so an FK is not expressible here.

Both steps are guarded by an inspector check so a re-run is a no-op rather than
a `DuplicateColumn`.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260803_0002"
down_revision = "20260517_0001"
branch_labels = None
depends_on = None

TABLE = "bookings"


def _columns() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(TABLE)}


def _indexes() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {index["name"] for index in inspector.get_indexes(TABLE)}


def upgrade() -> None:
    existing = _columns()

    if "mode" not in existing:
        op.add_column(
            TABLE,
            sa.Column("mode", sa.String(16), nullable=False, server_default="in_person"),
        )
    if "ix_bookings_mode" not in _indexes():
        op.create_index("ix_bookings_mode", TABLE, ["mode"])

    if "room_id" not in existing:
        op.add_column(
            TABLE,
            sa.Column("room_id", postgresql.UUID(as_uuid=True), nullable=True),
        )


def downgrade() -> None:
    existing = _columns()

    if "room_id" in existing:
        op.drop_column(TABLE, "room_id")
    if "ix_bookings_mode" in _indexes():
        op.drop_index("ix_bookings_mode", table_name=TABLE)
    if "mode" in existing:
        op.drop_column(TABLE, "mode")
