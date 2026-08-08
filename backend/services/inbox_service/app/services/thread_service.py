from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import set_committed_value

from shared.audit import audited_read

from ..models.audit import AccessAudit
from ..models.thread import InboxThread, ThreadMessage, ThreadParticipant, ThreadStatus
from ..schemas.thread import HandoffCreate, ThreadCreate, ThreadMessageCreate


class InboxError(RuntimeError):
    pass


def _principal_uuid(principal) -> UUID:
    subject = principal["subject"] if isinstance(principal, dict) else principal.subject
    try:
        return UUID(str(subject))
    except ValueError as exc:  # noqa: BLE001
        raise InboxError("invalid principal subject") from exc


def _principal_role(principal) -> str:
    return str(principal["role"] if isinstance(principal, dict) else principal.role)


async def _ensure_participant(session: AsyncSession, thread: InboxThread, user_id: UUID, role: str) -> ThreadParticipant:
    participant = await session.scalar(
        select(ThreadParticipant).where(ThreadParticipant.thread_id == thread.id, ThreadParticipant.user_id == user_id)
    )
    if participant is None:
        participant = ThreadParticipant(thread_id=thread.id, user_id=user_id, role=role, joined_at=datetime.now(tz=UTC))
        session.add(participant)
    else:
        participant.is_active = True
    await session.flush()
    return participant


async def create_direct_thread(session: AsyncSession, principal, payload: ThreadCreate) -> InboxThread:
    creator_id = _principal_uuid(principal)
    thread = InboxThread(
        subject=payload.subject,
        source=payload.source,
        status=ThreadStatus.OPEN.value,
        created_by_user_id=creator_id,
        assigned_role=payload.assigned_role,
        booking_id=payload.booking_id,
        last_message_at=datetime.now(tz=UTC),
    )
    session.add(thread)
    await session.flush()
    await _ensure_participant(session, thread, creator_id, _principal_role(principal))
    for user_id, role in zip(payload.participant_user_ids, payload.participant_roles, strict=False):
        await _ensure_participant(session, thread, user_id, role)
    return thread


async def create_handoff_thread(session: AsyncSession, principal, payload: HandoffCreate) -> tuple[InboxThread, ThreadMessage]:
    if _principal_role(principal) not in {"service", "admin"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
    creator_id = _principal_uuid(principal)
    thread = InboxThread(
        subject=payload.subject,
        source="handoff",
        status=ThreadStatus.PENDING.value,
        created_by_user_id=creator_id,
        assigned_role=payload.assigned_role,
        booking_id=payload.booking_id,
        last_message_at=datetime.now(tz=UTC),
    )
    session.add(thread)
    await session.flush()
    await _ensure_participant(session, thread, payload.user_id, "user")
    await _ensure_participant(session, thread, creator_id, _principal_role(principal))
    message = ThreadMessage(
        thread_id=thread.id,
        sender_user_id=creator_id,
        sender_role=_principal_role(principal),
        body=payload.summary,
        is_internal=True,
    )
    session.add(message)
    await session.flush()
    return thread, message


async def list_threads(session: AsyncSession, principal) -> list[InboxThread]:
    principal_id = _principal_uuid(principal)
    result = await session.scalars(
        select(InboxThread)
        .join(ThreadParticipant, ThreadParticipant.thread_id == InboxThread.id)
        .where(ThreadParticipant.user_id == principal_id, ThreadParticipant.is_active.is_(True))
        .order_by(InboxThread.last_message_at.desc().nullslast(), InboxThread.created_at.desc())
        .distinct()
    )
    return list(result.all())


async def get_thread(session: AsyncSession, principal, thread_id: UUID) -> InboxThread:
    thread = await session.get(InboxThread, thread_id)
    if thread is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "thread not found")
    principal_id = _principal_uuid(principal)
    participant = await session.scalar(
        select(ThreadParticipant).where(ThreadParticipant.thread_id == thread.id, ThreadParticipant.user_id == principal_id)
    )
    if participant is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
    return thread


async def _thread_subject_user_id(session: AsyncSession, thread: InboxThread) -> UUID | None:
    """The user id of the thread's PATIENT-side participant — the data subject.

    Participants carry a role. `create_handoff_thread` files the patient as
    `"user"`; `create_direct_thread` copies whatever role the caller supplied,
    which is `"patient"` for a patient. Both are accepted here.

    Returns None when no participant carries either role (an internal
    staff-only thread). NULL is the honest answer; falling back to
    `created_by_user_id` would label a service account or a clinician as the
    data subject, and a wrong subject in an access log is worse than a missing
    one — it makes a per-subject query return the wrong answer confidently.
    """
    return await session.scalar(
        select(ThreadParticipant.user_id)
        .where(ThreadParticipant.thread_id == thread.id, ThreadParticipant.role.in_(("user", "patient")))
        .order_by(ThreadParticipant.joined_at.asc())
        .limit(1)
    )


async def read_thread_detail(session: AsyncSession, principal, thread_id: UUID) -> InboxThread:
    """Router-facing single-thread read. AUDITED, both outcomes.

    `get_thread` stays unaudited: it is the internal authorization helper that
    `list_messages`, `post_message` and `mark_thread_read` all call, so
    auditing it would write two rows per request and file writes as reads.
    Same discipline as `ehr_service`'s `enforce_access=False`.
    """
    thread = await session.get(InboxThread, thread_id)
    if thread is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "thread not found")
    async with audited_read(session, AccessAudit, principal, "thread", resource_id=thread_id) as audit:
        audit.patient_id = await _thread_subject_user_id(session, thread)
        thread = await get_thread(session, principal, thread_id)
    return thread


async def list_messages(session: AsyncSession, principal, thread_id: UUID) -> list[ThreadMessage]:
    """Clinical message bodies. AUDITED, both outcomes.

    **No message bodies, no subject line, no `summary`.** A handoff thread's
    first message is a clinical summary written by a service account; a direct
    thread's subject line routinely contains the complaint. The row records the
    thread id, the data subject, the reader and the number of messages, which is
    what "who read this patient's messages?" needs and is the whole of what it
    needs.
    """
    thread = await session.get(InboxThread, thread_id)
    if thread is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "thread not found")
    async with audited_read(session, AccessAudit, principal, "thread_messages", resource_id=thread_id) as audit:
        audit.patient_id = await _thread_subject_user_id(session, thread)
        thread = await get_thread(session, principal, thread_id)
        result = await session.scalars(
            select(ThreadMessage).where(ThreadMessage.thread_id == thread.id).order_by(ThreadMessage.created_at.asc())
        )
        messages = list(result.all())
        audit.record_count = len(messages)
    return messages


async def post_message(session: AsyncSession, principal, thread_id: UUID, payload: ThreadMessageCreate) -> ThreadMessage:
    thread = await get_thread(session, principal, thread_id)
    sender_id = _principal_uuid(principal)
    participant = await session.scalar(
        select(ThreadParticipant).where(ThreadParticipant.thread_id == thread.id, ThreadParticipant.user_id == sender_id)
    )
    if participant is None or not participant.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
    message = ThreadMessage(
        thread_id=thread.id,
        sender_user_id=sender_id,
        sender_role=_principal_role(principal),
        body=payload.body,
        is_internal=False,
    )
    thread.last_message_at = datetime.now(tz=UTC)
    session.add(message)
    await session.flush()

    # Deferred import: `attachment_service` imports `get_thread` and
    # `_thread_subject_user_id` from this module, so a top-level import here
    # would be circular. The dependency runs one way at import time
    # (attachments -> threads) and the other way at call time.
    from .attachment_service import attach_to_message

    attachments = await attach_to_message(session, principal, thread, message, payload.attachment_ids)

    # `set_committed_value`, NOT `message.attachments = [...]`.
    #
    # `ThreadMessage.attachments` is `lazy="selectin"`, which pre-loads only for
    # objects that came out of a query. This one was just constructed and
    # flushed, so the collection is unloaded — and a plain assignment first
    # LOADS the old value to compute the delta, which is synchronous IO on an
    # async session and dies with MissingGreenlet. (It does so on a body-only
    # send too, with an empty list: the load happens before the value is even
    # looked at. That is how this broke every existing message test the first
    # time round.)
    #
    # `set_committed_value` populates the loaded state directly and emits no
    # query, which is correct here because the FK was just written by
    # `attach_to_message` — this is not a change to persist, it is the state
    # the database already holds.
    set_committed_value(message, "attachments", attachments)
    return message


async def mark_thread_read(session: AsyncSession, principal, thread_id: UUID) -> ThreadParticipant:
    thread = await get_thread(session, principal, thread_id)
    principal_id = _principal_uuid(principal)
    participant = await session.scalar(
        select(ThreadParticipant).where(ThreadParticipant.thread_id == thread.id, ThreadParticipant.user_id == principal_id)
    )
    if participant is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
    participant.last_read_at = datetime.now(tz=UTC)
    await session.flush()
    return participant