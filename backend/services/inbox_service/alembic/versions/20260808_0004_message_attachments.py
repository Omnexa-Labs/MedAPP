"""create thread_message_attachments (voice notes and file uploads)

Revision ID: 20260808_0004
Revises: 20260805_0003
Create Date: 2026-08-08

WHAT AND WHY
------------
The mobile composer has been able to pick a file and record a voice note for
some time (`frontend/mobile/MedAPP/src/features/chat/useComposerMedia.ts` — real
expo-document-picker, real expo-audio, real permission handling), and the file
has never left the handset, because no endpoint accepted one. This table is the
metadata half of the upload path; the bytes live behind `app/storage.py`.

`message_id` IS NULLABLE ON PURPOSE. An attachment is uploaded before the
message that carries it exists — see `app/models/attachment.py` for the full
argument. `thread_id` is NOT NULL from the first instant, so authorisation
never depends on the message.

SERVER DEFAULTS ON created_at / updated_at — THE REPEATED DEFECT HERE
---------------------------------------------------------------------
Both timestamps carry `server_default=sa.func.now()`, matching
`shared.db.TimestampMixin`. This is not decoration. The mixin declares them
`server_default=func.now()`, so SQLAlchemy sends **no value** for either column
and relies entirely on the database — a table created NOT NULL without the
default takes every INSERT down with:

    asyncpg.exceptions.NotNullViolationError: null value in column
    "created_at" of relation "thread_message_attachments"
    violates not-null constraint

This repo has shipped that exact defect at least three times
(`telemedicine_service` rev 20260803_0002; this service's own rev
20260805_0003, which existed solely to repair the three tables created by rev
20260518_0001). It survives review because **the tests cannot see it**: the
suites build their schema from `Base.metadata.create_all`, which reads the
MODEL, and the model carries the mixin's defaults. A green suite sits happily
on top of a table that cannot accept a row.

IDEMPOTENCE
-----------
Guarded by `sa.inspect(op.get_bind())`, the pattern used by rev 20260805_0002
and `booking_service` rev 20260805_0003. Some dev setups and every test build
the schema with `create_all` before Alembic runs, so the table can already
exist. `user_service` rev 0003 has failed on a clean database for exactly this
reason.

DOWNGRADE DROPS THE TABLE AND ORPHANS THE FILES
-----------------------------------------------
The bytes are on a volume, not in Postgres, so `downgrade()` deletes every
attachment's metadata and leaves its content on disk with nothing left that can
name it. Nothing here can fix that — deleting patient files from a schema
downgrade would be worse — so it is stated rather than papered over. Clean up
`INBOX_ATTACHMENT_ROOT` by hand if you ever run it.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260808_0004"
down_revision = "20260805_0003"
branch_labels = None
depends_on = None

TABLE = "thread_message_attachments"


def _table_exists(name: str) -> bool:
    return name in set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    if _table_exists(TABLE):
        return

    op.create_table(
        TABLE,
        sa.Column("id", sa.UUID(), primary_key=True, nullable=False),
        # THE SERVER DEFAULTS. See the module docstring — omitting either of
        # these makes every upload fail with a NotNullViolation that no test
        # in this repo is capable of catching.
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "thread_id",
            sa.UUID(),
            sa.ForeignKey("threads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Nullable: staged before the message exists.
        sa.Column(
            "message_id",
            sa.UUID(),
            sa.ForeignKey("thread_messages.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("uploader_user_id", sa.UUID(), nullable=False),
        sa.Column("content_type", sa.String(length=128), nullable=False),
        # BigInteger: the cap is a config value and can move; a column type
        # cannot, cheaply.
        sa.Column("byte_size", sa.BigInteger(), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("storage_key", sa.String(length=512), nullable=False),
        # Milliseconds. NULL for anything that is not audio.
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        # UNIQUE so a key collision surfaces as an error rather than as one
        # upload silently overwriting another patient's file.
        sa.UniqueConstraint("storage_key", name="uq_attachment_storage_key"),
    )
    op.create_index("ix_thread_message_attachments_thread_id", TABLE, ["thread_id"])
    op.create_index("ix_thread_message_attachments_message_id", TABLE, ["message_id"])
    op.create_index("ix_thread_message_attachments_uploader_user_id", TABLE, ["uploader_user_id"])


def downgrade() -> None:
    if not _table_exists(TABLE):
        return
    op.drop_index("ix_thread_message_attachments_uploader_user_id", table_name=TABLE)
    op.drop_index("ix_thread_message_attachments_message_id", table_name=TABLE)
    op.drop_index("ix_thread_message_attachments_thread_id", table_name=TABLE)
    op.drop_table(TABLE)
