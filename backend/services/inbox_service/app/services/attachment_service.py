"""Attachment business logic. The router does none of it.

AUTHORISATION MODEL — one rule, applied four times
--------------------------------------------------
**Only an active participant of the thread may upload to it, list its
attachments, or read one back. Everyone else gets 403.**

Every function here starts by calling `thread_service.get_thread`, which is the
same helper `list_messages`, `post_message` and `mark_thread_read` already use.
That is deliberate: attachments do not get a second, parallel notion of "may
this person see this thread" that can drift from the first one. A missing
thread is 404 before the check, matching the existing routes.

The attachment id is checked against the thread id on every fetch, so a
participant of thread A cannot read an attachment belonging to thread B by
guessing its id — the id alone is never sufficient.

WHAT IS AUDITED, AND WHY IT IS NOT EVERYTHING
---------------------------------------------
`open_attachment` writes an `AccessAudit` row for both outcomes, because that
is the call that actually moves PHI bytes to a reader. `list_thread_attachments`
is audited too — a list of a patient's file names and voice-note durations is
itself disclosive.

Uploads are NOT audited here. `access_audit` is a READ trail (see
`shared.audit.model`); filing a write into it would make "who read this
patient's data?" return the patient's own uploads and overstate exposure. The
row itself, with `uploader_user_id` and `created_at`, is the write record.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from uuid import UUID

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.audit import audited_read

from ..config import ALLOWED_CONTENT_TYPES, settings
from ..models.attachment import MessageAttachment
from ..models.audit import AccessAudit
from ..models.thread import InboxThread, ThreadMessage
from ..storage import CHUNK_BYTES, AttachmentStorage, get_storage
from .thread_service import _principal_uuid, _thread_subject_user_id, get_thread

# Fallback when a client sends no filename at all (expo-audio recordings have
# no name — they are a uri and a duration). ASCII, no extension derived from
# anything user-supplied.
DEFAULT_FILENAME = "attachment"


def _storage() -> AttachmentStorage:
    return get_storage()


def _normalise_content_type(raw: str | None) -> str:
    """`audio/m4a; codecs=mp4a.40.2` -> `audio/m4a`, lowercased.

    Multipart parts legitimately carry parameters. Matching the raw header
    against the allowlist would reject a correct upload for having a codec
    hint, which is the kind of rejection that gets diagnosed as "uploads are
    broken".
    """
    if not raw:
        return ""
    return raw.split(";", 1)[0].strip().lower()


def _validate_content_type(raw: str | None) -> str:
    content_type = _normalise_content_type(raw)
    if content_type not in ALLOWED_CONTENT_TYPES:
        # 415, not 400. The request is well-formed; the MEDIA TYPE is the
        # problem, and 415 is the status that says exactly that — a client can
        # branch on it without parsing the message.
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"content type {content_type or '(missing)'!s} is not accepted; allowed: "
            + ", ".join(sorted(ALLOWED_CONTENT_TYPES)),
        )
    return content_type


def _validate_duration(duration_ms: int | None) -> int | None:
    if duration_ms is None:
        return None
    if duration_ms < 0 or duration_ms > settings.max_attachment_duration_ms:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"duration_ms must be between 0 and {settings.max_attachment_duration_ms}",
        )
    return duration_ms


def _safe_filename(raw: str | None) -> str:
    """Display name only — it never touches the filesystem.

    `storage.build_key` generates the path from a UUID, so traversal is not
    reachable from here. Stripping directory separators anyway means the value
    is also safe for a client that naively uses it as a download name, and
    truncation keeps it inside the 255-char column.
    """
    candidate = (raw or "").replace("\\", "/").rsplit("/", 1)[-1].strip()
    candidate = candidate.replace("\r", "").replace("\n", "").replace('"', "")
    if not candidate:
        return DEFAULT_FILENAME
    return candidate[:255]


async def _load_thread(session: AsyncSession, principal, thread_id: UUID) -> InboxThread:
    """404 for a thread that does not exist, 403 for one you are not in.

    Same order as `thread_service.list_messages`. Deliberately NOT collapsed
    into a uniform 404: this service already tells a caller that a thread
    exists via `get_thread`, so answering 404 here and 403 there would be
    inconsistent without closing any real enumeration gap.
    """
    thread = await session.get(InboxThread, thread_id)
    if thread is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "thread not found")
    return await get_thread(session, principal, thread_id)


async def _read_capped(upload: UploadFile, limit: int) -> AsyncIterator[bytes]:
    """Yield the upload in chunks, raising 413 the moment it exceeds `limit`.

    The cap is enforced DURING the read, not from the declared `Content-Length`
    — a client controls that header, and trusting it is how "we have a size
    limit" becomes decorative. The generator raises rather than truncating, so
    a partial file is never persisted as if it were whole.
    """
    total = 0
    while True:
        chunk = await upload.read(CHUNK_BYTES)
        if not chunk:
            return
        total += len(chunk)
        if total > limit:
            raise HTTPException(
                status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                f"attachment exceeds the {limit} byte limit",
            )
        yield chunk


async def upload_attachment(
    session: AsyncSession,
    principal,
    thread_id: UUID,
    upload: UploadFile,
    duration_ms: int | None = None,
) -> MessageAttachment:
    """Stage an attachment against a thread. `message_id` stays NULL.

    Order matters and is defensive: authorise, then validate the declared type
    and duration, and only THEN accept a single byte of the body. Writing 8 MiB
    to disk before discovering the caller is not a participant would make this
    route a free write primitive for anyone with a token.
    """
    thread = await _load_thread(session, principal, thread_id)
    content_type = _validate_content_type(upload.content_type)
    duration_ms = _validate_duration(duration_ms)

    storage = _storage()
    key = storage.build_key(thread.id)
    try:
        byte_size = await storage.write(key, _read_capped(upload, settings.max_attachment_bytes))
    except HTTPException:
        # 413 mid-write leaves a partial file. Reap it — the row was never
        # created, so nothing would ever reference it again.
        await storage.delete(key)
        raise
    except Exception:
        await storage.delete(key)
        raise

    if byte_size == 0:
        await storage.delete(key)
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "attachment is empty")

    attachment = MessageAttachment(
        thread_id=thread.id,
        message_id=None,
        uploader_user_id=_principal_uuid(principal),
        content_type=content_type,
        byte_size=byte_size,
        original_filename=_safe_filename(upload.filename),
        storage_key=key,
        duration_ms=duration_ms,
    )
    session.add(attachment)
    try:
        await session.flush()
    except Exception:
        # The bytes are on disk and the row is not. Without this the volume
        # accumulates files nothing can ever name or delete.
        await storage.delete(key)
        raise
    return attachment


async def attach_to_message(
    session: AsyncSession,
    principal,
    thread: InboxThread,
    message: ThreadMessage,
    attachment_ids: Sequence[UUID],
) -> list[MessageAttachment]:
    """Adopt staged attachments into a just-created message.

    Called by `thread_service.post_message`; the caller has already authorised
    the thread. Four conditions, each a 4xx and none a silent skip — a message
    that quietly drops the voice note the user recorded is worse than a
    rejected send, because the user believes it went.

    Requiring `uploader_user_id == sender` is the one that is not obvious: two
    clinicians can share a thread, and without it either could adopt the
    other's staged upload into their own message and change who a file appears
    to have come from.
    """
    if not attachment_ids:
        return []

    sender_id = _principal_uuid(principal)
    # dict.fromkeys: de-duplicate while preserving the client's order, so
    # sending the same id twice is not an error and not a double attach.
    unique_ids = list(dict.fromkeys(attachment_ids))

    rows = list(
        (
            await session.scalars(
                select(MessageAttachment).where(MessageAttachment.id.in_(unique_ids))
            )
        ).all()
    )
    by_id = {row.id: row for row in rows}

    resolved: list[MessageAttachment] = []
    for attachment_id in unique_ids:
        attachment = by_id.get(attachment_id)
        if attachment is None or attachment.thread_id != thread.id:
            # Same response for "does not exist" and "belongs to another
            # thread": an id from a thread you are not in must not be
            # distinguishable from a fabricated one.
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"attachment {attachment_id} not found in this thread")
        if attachment.uploader_user_id != sender_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "attachment was uploaded by another user")
        if attachment.message_id is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, f"attachment {attachment_id} is already attached to a message")
        attachment.message_id = message.id
        resolved.append(attachment)

    await session.flush()
    return resolved


async def list_thread_attachments(session: AsyncSession, principal, thread_id: UUID) -> list[MessageAttachment]:
    """Every attachment in the thread, staged and sent. AUDITED, both outcomes.

    Metadata only — filenames, sizes, durations. No bytes, and no route here
    hands out a path that would produce bytes without a fresh authorisation.
    """
    thread = await session.get(InboxThread, thread_id)
    if thread is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "thread not found")
    async with audited_read(session, AccessAudit, principal, "thread_attachments", resource_id=thread_id) as audit:
        audit.patient_id = await _thread_subject_user_id(session, thread)
        thread = await get_thread(session, principal, thread_id)
        result = await session.scalars(
            select(MessageAttachment)
            .where(MessageAttachment.thread_id == thread.id)
            .order_by(MessageAttachment.created_at.asc())
        )
        items = list(result.all())
        audit.record_count = len(items)
    return items


async def open_attachment(
    session: AsyncSession, principal, thread_id: UUID, attachment_id: UUID
) -> tuple[MessageAttachment, AsyncIterator[bytes]]:
    """Authorise, then return the row plus a byte stream. AUDITED, both outcomes.

    This is the only path in the service that produces attachment content.

    The returned iterator is NOT consumed here — the router hands it to a
    `StreamingResponse`, so an 8 MiB PDF is never fully resident. The audit row
    is written on the way in, before any byte leaves, which is the correct
    moment: a download that fails halfway still disclosed what it disclosed.
    """
    thread = await session.get(InboxThread, thread_id)
    if thread is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "thread not found")

    async with audited_read(
        session, AccessAudit, principal, "thread_attachment", resource_id=attachment_id
    ) as audit:
        audit.patient_id = await _thread_subject_user_id(session, thread)
        thread = await get_thread(session, principal, thread_id)
        attachment = await session.get(MessageAttachment, attachment_id)
        if attachment is None or attachment.thread_id != thread.id:
            # The id is checked AGAINST THIS THREAD. Holding a valid
            # attachment id from a thread you are not a participant of gets
            # you a 404, not the file.
            raise HTTPException(status.HTTP_404_NOT_FOUND, "attachment not found")
        audit.record_count = 1

    storage = _storage()
    if not await storage.exists(attachment.storage_key):
        # A row whose bytes are gone (see the backup limitation in
        # `storage.py`). 404 rather than letting the stream raise a 500
        # mid-response, which a client cannot distinguish from a network drop.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "attachment content is unavailable")

    return attachment, storage.stream(attachment.storage_key)
