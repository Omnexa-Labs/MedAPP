"""`thread_message_attachments` — the metadata row for an uploaded file.

The bytes are NOT here. This table holds the identifiers, the authorisation
anchor and everything a client needs to render an attachment WITHOUT fetching
it; `app/storage.py` holds the content behind an opaque `storage_key`.

TWO-PHASE ON PURPOSE — why `message_id` is nullable
---------------------------------------------------
The composer picks a file BEFORE the user has finished typing, and a voice note
exists the moment recording stops. Requiring a message id at upload time would
force the client to either send the text first (and show an attachment
appearing a beat later, out of order) or hold the bytes until send (and make a
slow 8 MiB upload look like a slow send button).

So an attachment is uploaded standalone — `message_id IS NULL`, "staged" — and
adopted by the message that references it. `thread_id` is NOT NULL from the
first instant, which is the point: **authorisation never depends on the message
existing.** A staged attachment is already fenced to a thread, so the
participant check in `attachment_service` works identically in both phases.

The cost, stated plainly: a staged attachment whose message is never sent is an
orphan row plus an orphan file, and **nothing reaps them today**. See the "Not
built" list in `docs/api/inbox_service.md`.

`duration_ms` IS A FIRST-CLASS COLUMN, NOT AN AFTERTHOUGHT
----------------------------------------------------------
A voice-note bubble draws a play button, a duration and a scrubber before
anyone taps play. Deriving the duration would mean the client downloading the
whole file to measure it — on a mobile data plan, for a bubble the user may
never listen to. So the recorder's own measurement is persisted at upload and
returned in the message payload. Null for everything that is not audio.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import BigInteger, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from shared.db.base import Base, TimestampMixin


class MessageAttachment(Base, TimestampMixin):
    __tablename__ = "thread_message_attachments"

    # The authorisation anchor. Set at upload, never null, never changed.
    thread_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("threads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Null while staged; set once a message adopts it. CASCADE so deleting a
    # message does not leave a row pointing at a message id that is gone.
    message_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("thread_messages.id", ondelete="CASCADE"), nullable=True, index=True
    )
    uploader_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    content_type: Mapped[str] = mapped_column(String(128), nullable=False)
    # BigInteger, not Integer: the cap is 8 MiB today and a column type is far
    # harder to change later than a config value.
    byte_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # Display only. It is never used to build a path — see `storage.build_key`.
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    # Opaque handle into whatever `AttachmentStorage` is configured. Unique so a
    # key collision is a database error rather than one upload silently
    # overwriting another's bytes.
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    @property
    def attachment_id(self) -> UUID:
        # Same convention as InboxThread.thread_id / ThreadMessage.message_id:
        # the wire name is domain-specific, the column is `id`.
        return self.id
