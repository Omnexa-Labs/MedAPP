from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ThreadStatus(StrEnum):
    OPEN = "open"
    PENDING = "pending"
    CLOSED = "closed"


class ThreadCreate(BaseModel):
    subject: str = Field(min_length=1, max_length=255)
    source: str = Field(default="direct", max_length=32)
    participant_user_ids: list[UUID] = Field(default_factory=list)
    participant_roles: list[str] = Field(default_factory=list)
    assigned_role: str | None = Field(default=None, max_length=32)
    booking_id: UUID | None = None


class HandoffCreate(BaseModel):
    user_id: UUID
    assigned_role: str
    subject: str = Field(min_length=1, max_length=255)
    summary: str = Field(min_length=1, max_length=2000)
    booking_id: UUID | None = None
    locale: str = Field(default="en", max_length=8)


class ThreadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    thread_id: UUID
    subject: str
    source: str
    status: ThreadStatus
    created_by_user_id: UUID
    assigned_role: str | None
    assigned_user_id: UUID | None
    booking_id: UUID | None
    last_message_at: datetime | None = None


class ThreadParticipantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    participant_id: UUID
    thread_id: UUID
    user_id: UUID
    role: str
    joined_at: datetime | None = None
    last_read_at: datetime | None = None
    is_active: bool


class AttachmentOut(BaseModel):
    """Everything needed to RENDER an attachment without downloading it.

    A voice-note bubble needs a duration and a content type to draw its player;
    a file chip needs a name and a size. All four are here, so the list view
    costs one request rather than one request per bubble.

    **There is no `url` field, and that is a security decision, not an
    omission.** See `routers/attachments.py`. The client builds the fetch path
    from `attachment_id` and sends its normal bearer token.
    """

    model_config = ConfigDict(from_attributes=True)

    attachment_id: UUID
    thread_id: UUID
    message_id: UUID | None
    uploader_user_id: UUID
    content_type: str
    byte_size: int
    original_filename: str
    # Milliseconds, audio only, null otherwise. The recorder's measurement,
    # persisted at upload — see `models/attachment.py`.
    duration_ms: int | None = None
    created_at: datetime


class AttachmentList(BaseModel):
    items: list[AttachmentOut] = Field(default_factory=list)


class ThreadMessageCreate(BaseModel):
    """**A body-only `{"body": "..."}` send is unchanged.** Deliberately.

    `attachment_ids` is optional and defaults to empty, so every existing
    caller — `frontend/mobile/MedAPP/src/features/chat/api.ts`, the seeded
    scripts, anything already in flight — keeps working byte for byte.

    `body` relaxed from `min_length=1` to a default of `""`, WITHOUT widening
    what is accepted: the validator below requires text or at least one
    attachment, so `{"body": ""}` and `{}` are still 422 exactly as before. The
    relaxation exists for one real case — a voice note with no typed text,
    which is the normal way people send one.
    """

    body: str = Field(default="", max_length=4000)
    # Staged attachments, uploaded first via POST /{thread_id}/attachments.
    # Capped at 8: a defensive bound, not a product feature. The composer's
    # slot is single (`useComposerMedia.ts`), so today this is always 0 or 1.
    attachment_ids: list[UUID] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def _require_body_or_attachment(self) -> ThreadMessageCreate:
        if not self.body.strip() and not self.attachment_ids:
            raise ValueError("body must be non-empty when no attachment is supplied")
        return self


class ThreadMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    message_id: UUID
    thread_id: UUID
    sender_user_id: UUID | None
    sender_role: str
    body: str
    is_internal: bool
    created_at: datetime
    # ADDITIVE. Always present, `[]` for the overwhelming majority of messages.
    # An existing client that ignores the key is unaffected.
    attachments: list[AttachmentOut] = Field(default_factory=list)


class ThreadList(BaseModel):
    items: list[ThreadOut] = Field(default_factory=list)