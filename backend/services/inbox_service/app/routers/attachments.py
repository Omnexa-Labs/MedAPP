"""Attachment routes. Thin — every decision lives in `attachment_service`.

THE PHI DECISION: THERE IS NO ATTACHMENT URL
--------------------------------------------
The obvious design is to return a link. It was rejected, and the reasoning
belongs next to the code that would have carried it.

A URL that grants access **is a bearer credential**, and an unusually leaky
one. It lands in browser history, in proxy and CDN logs, in the `Referer`
header of the next page, in a screenshot, in the "copy link" a patient sends to
a relative. A pre-signed S3 URL is the same object with an expiry bolted on:
still a credential, still copyable, still valid for everyone who obtains the
string before it expires. For a voice note in which a patient describes their
symptoms, that is not an acceptable failure mode.

So:

* `AttachmentOut` has **no `url` field**. The client composes
  `/v1/threads/{thread_id}/attachments/{attachment_id}/content` from ids it
  already holds and sends its normal `Authorization` header, exactly as it does
  for messages. **The id is not a capability** — possession of it grants
  nothing; participation in the thread does.
* Authorisation is re-checked on **every** content fetch, against the CURRENT
  participant list. Revoking someone's access is removing them from the thread,
  and it takes effect on the next request rather than whenever an issued link
  happens to expire.
* No static-file mount serves the storage directory. `app/main.py` mounts
  nothing; the only way bytes leave this process is the handler below.

RESPONSE HEADERS, AND WHY EACH ONE IS THERE
-------------------------------------------
* `Content-Disposition: attachment` — the file is never rendered inline. An
  uploaded HTML or SVG file declared as an allowed type cannot execute in the
  app's origin, because nothing ever renders it in a document context.
* `X-Content-Type-Options: nosniff` — the declared content type is
  client-supplied (see the allowlist note in `config.py`). nosniff stops a
  browser from deciding for itself that the bytes look like something more
  interesting.
* `Cache-Control: no-store` — PHI must not sit in a shared or disk cache after
  the reader's access has been revoked.
* `Content-Length` — set from the stored `byte_size` so clients get a real
  progress bar instead of an indeterminate spinner on a chunked response.
"""

from uuid import UUID

from fastapi import APIRouter, File, Form, Path, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import CurrentPrincipalDep, DbSession
from ..schemas.thread import AttachmentList, AttachmentOut
from ..services.attachment_service import list_thread_attachments, open_attachment, upload_attachment

# Same prefix as `threads.py`, its own tag. Two routers on one prefix is a
# FastAPI-supported split and keeps the attachment surface reviewable on its
# own rather than buried at the bottom of the thread routes.
router = APIRouter(prefix="/v1/threads", tags=["Attachments"])


@router.post("/{thread_id}/attachments", response_model=AttachmentOut, status_code=status.HTTP_201_CREATED)
async def upload(
    thread_id: UUID,
    file: UploadFile = File(..., description="The attachment. Size and content type are enforced server-side."),
    duration_ms: int | None = Form(
        default=None,
        description="Voice notes only: the recorded length in milliseconds, so the client can draw a player without downloading the file.",
    ),
    session: AsyncSession = DbSession,
    principal=CurrentPrincipalDep,
):
    """Stage an attachment against a thread. Participants only.

    Returns 201 with the metadata row. The attachment is not attached to any
    message yet — pass its `attachment_id` in `ThreadMessageCreate.attachment_ids`
    to send it.

    403 non-participant · 413 too large · 415 disallowed content type ·
    422 empty file or out-of-range `duration_ms`.
    """
    return await upload_attachment(session, principal, thread_id, file, duration_ms)


@router.get("/{thread_id}/attachments", response_model=AttachmentList)
async def index(thread_id: UUID, session: AsyncSession = DbSession, principal=CurrentPrincipalDep):
    """Metadata for every attachment in the thread, staged and sent.

    `{items: [...]}`, matching `ThreadList` rather than the bare array
    `GET /{thread_id}/messages` returns. The asymmetry documented in
    `docs/api/inbox_service.md` is inherited, not extended: new list routes use
    the envelope.
    """
    return {"items": await list_thread_attachments(session, principal, thread_id)}


@router.get("/{thread_id}/attachments/{attachment_id}/content")
async def content(
    thread_id: UUID,
    attachment_id: UUID = Path(..., description="Not a capability — see this module's docstring."),
    session: AsyncSession = DbSession,
    principal=CurrentPrincipalDep,
):
    """Stream the bytes back. Participants only, re-checked on every call."""
    attachment, stream = await open_attachment(session, principal, thread_id, attachment_id)
    return StreamingResponse(
        stream,
        media_type=attachment.content_type,
        headers={
            # filename* (RFC 5987) so a non-ASCII original name survives, and
            # the quoted form is safe because `_safe_filename` has already
            # stripped quotes and CR/LF — a header injection here would be a
            # response-splitting bug.
            "Content-Disposition": f'attachment; filename="{attachment.original_filename}"',
            "Content-Length": str(attachment.byte_size),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
        },
    )
