from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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


async def list_messages(session: AsyncSession, principal, thread_id: UUID) -> list[ThreadMessage]:
    thread = await get_thread(session, principal, thread_id)
    result = await session.scalars(
        select(ThreadMessage).where(ThreadMessage.thread_id == thread.id).order_by(ThreadMessage.created_at.asc())
    )
    return list(result.all())


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