from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import jwt
from jwt import ExpiredSignatureError, InvalidTokenError
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.audit import audited_read

from ..config import settings
from ..models.audit import AccessAudit
from ..models.room import Room, RoomMessage, RoomParticipant, RoomStatus
from ..schemas.room import RoomCreate, RoomMessageCreate


class RoomError(RuntimeError):
    pass


def _principal_uuid(principal) -> UUID:
    try:
        return UUID(str(principal["subject"]) if isinstance(principal, dict) else str(principal.subject))
    except ValueError as exc:  # noqa: BLE001
        raise RoomError("invalid principal subject") from exc


def _principal_role(principal) -> str:
    return str(principal["role"] if isinstance(principal, dict) else principal.role)


def _principal_subject(principal) -> str:
    return str(principal["subject"] if isinstance(principal, dict) else principal.subject)


def _assert_participant(room: Room, principal) -> None:
    principal_id = _principal_uuid(principal)
    if principal_id not in {room.created_by_user_id}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")


def _issue_room_token(*, room_id: UUID, subject: str, role: str, ttl_minutes: int = 60) -> str:
    now = datetime.now(tz=UTC)
    payload = {
        "sub": subject,
        "role": role,
        "room_id": str(room_id),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ttl_minutes)).timestamp()),
        "typ": "room",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def verify_room_token(token: str, room_id: UUID) -> dict:
    try:
        claims = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except ExpiredSignatureError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "room token expired") from exc
    except InvalidTokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid room token") from exc
    if claims.get("typ") != "room" or str(claims.get("room_id")) != str(room_id):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid room token")
    return claims


async def create_room(session: AsyncSession, principal, payload: RoomCreate) -> Room:
    principal_id = _principal_uuid(principal)
    room_name = f"room_{payload.booking_id.hex}"
    existing = await session.scalar(select(Room).where(Room.booking_id == payload.booking_id))
    if existing is not None:
        return existing

    room = Room(
        booking_id=payload.booking_id,
        room_name=room_name,
        status=RoomStatus.SCHEDULED,
        scheduled_for=payload.scheduled_for,
        recording_enabled=payload.recording_enabled,
        created_by_user_id=principal_id,
    )
    session.add(room)
    await session.flush()

    for user_id, role in ((payload.patient_id, "patient"), (payload.doctor_id, "doctor")):
        session.add(RoomParticipant(room_id=room.id, user_id=user_id, role=role))
    await session.flush()
    return room


async def get_room(session: AsyncSession, principal, room_id: UUID) -> Room:
    room = await session.get(Room, room_id)
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "room not found")
    principal_id = _principal_uuid(principal)
    if principal_id != room.created_by_user_id:
        participant = await session.scalar(
            select(RoomParticipant).where(RoomParticipant.room_id == room.id, RoomParticipant.user_id == principal_id)
        )
        if participant is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
    return room


async def _room_patient_user_id(session: AsyncSession, room: Room) -> UUID | None:
    """The user id of the room's PATIENT participant — the data subject.

    A consultation room's participants are created with explicit roles
    ("patient", "doctor") by `create_room`, so the subject is a lookup rather
    than a guess. Returns None when there is no patient participant (a room
    provisioned before its participants, or an ad-hoc room): a NULL subject is
    an honest "we do not know", and inventing one — e.g. defaulting to
    `created_by_user_id` — would put a wrong fact in an audit log, which is
    worse than a missing one.
    """
    return await session.scalar(
        select(RoomParticipant.user_id).where(
            RoomParticipant.room_id == room.id, RoomParticipant.role == "patient"
        )
    )


async def read_room(session: AsyncSession, principal, room_id: UUID) -> Room:
    """Router-facing single-room read. AUDITED, both outcomes.

    `get_room` itself is deliberately NOT audited: it is the internal
    authorization helper that `join`/`leave`/`end`/`post_message`/
    `list_messages` all call, and auditing it would write two rows for one
    request and file a message POST under a read. Same discipline as
    `ehr_service`'s `enforce_access=False` — audit at the entry point, once.
    """
    room = await session.get(Room, room_id)
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "room not found")
    async with audited_read(session, AccessAudit, principal, "room", resource_id=room_id) as audit:
        audit.patient_id = await _room_patient_user_id(session, room)
        room = await get_room(session, principal, room_id)
    return room


async def generate_room_token(session: AsyncSession, principal, room_id: UUID) -> tuple[str, datetime]:
    """AUDITED as `room_token`.

    Issuing a room token is the moment access to a live consultation is
    granted — the token is what `join`/`post_message` check afterwards. A
    reviewer asking who could have been in a patient's consultation wants this
    row, not just the message reads.
    """
    room = await session.get(Room, room_id)
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "room not found")
    async with audited_read(session, AccessAudit, principal, "room_token", resource_id=room_id) as audit:
        audit.patient_id = await _room_patient_user_id(session, room)
        room = await get_room(session, principal, room_id)
    principal_id = _principal_uuid(principal)
    principal_role = _principal_role(principal)
    expires_at = datetime.now(tz=UTC) + timedelta(hours=1)
    return _issue_room_token(room_id=room.id, subject=str(principal_id), role=principal_role), expires_at


async def join_room(session: AsyncSession, principal, room_id: UUID, token: str) -> RoomParticipant:
    room = await get_room(session, principal, room_id)
    claims = verify_room_token(token, room.id)
    principal_id = _principal_uuid(principal)
    if str(claims.get("sub")) != str(principal_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")

    participant = await session.scalar(
        select(RoomParticipant).where(RoomParticipant.room_id == room.id, RoomParticipant.user_id == principal_id)
    )
    if participant is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not a room participant")
    participant.joined_at = datetime.now(tz=UTC)
    participant.left_at = None
    room.status = RoomStatus.ACTIVE
    await session.flush()
    return participant


async def leave_room(session: AsyncSession, principal, room_id: UUID, token: str) -> RoomParticipant:
    room = await get_room(session, principal, room_id)
    claims = verify_room_token(token, room.id)
    principal_id = _principal_uuid(principal)
    if str(claims.get("sub")) != str(principal_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")

    participant = await session.scalar(
        select(RoomParticipant).where(RoomParticipant.room_id == room.id, RoomParticipant.user_id == principal_id)
    )
    if participant is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not a room participant")
    participant.left_at = datetime.now(tz=UTC)
    await session.flush()
    return participant


async def end_room(session: AsyncSession, principal, room_id: UUID, token: str) -> Room:
    room = await get_room(session, principal, room_id)
    claims = verify_room_token(token, room.id)
    principal_id = _principal_uuid(principal)
    if str(claims.get("sub")) != str(principal_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")

    participant = await session.scalar(
        select(RoomParticipant).where(RoomParticipant.room_id == room.id, RoomParticipant.user_id == principal_id)
    )
    if participant is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not a room participant")
    room.status = RoomStatus.ENDED
    room.ended_at = datetime.now(tz=UTC)
    participant.left_at = room.ended_at
    await session.flush()
    return room


async def post_message(session: AsyncSession, principal, room_id: UUID, token: str, payload: RoomMessageCreate) -> RoomMessage:
    room = await get_room(session, principal, room_id)
    claims = verify_room_token(token, room.id)
    principal_id = _principal_uuid(principal)
    if str(claims.get("sub")) != str(principal_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")

    participant = await session.scalar(
        select(RoomParticipant).where(RoomParticipant.room_id == room.id, RoomParticipant.user_id == principal_id)
    )
    if participant is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not a room participant")
    message = RoomMessage(room_id=room.id, sender_user_id=principal_id, body=payload.body)
    session.add(message)
    await session.flush()
    return message


async def list_messages(session: AsyncSession, principal, room_id: UUID) -> list[RoomMessage]:
    """The consultation transcript. AUDITED, both outcomes.

    **No message bodies in the row.** The transcript is the most sensitive text
    in this service; the audit row records that it was read, by whom, whose
    consultation it was, and how many messages were handed over.
    """
    room = await session.get(Room, room_id)
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "room not found")
    async with audited_read(session, AccessAudit, principal, "room_messages", resource_id=room_id) as audit:
        audit.patient_id = await _room_patient_user_id(session, room)
        room = await get_room(session, principal, room_id)
        result = await session.scalars(select(RoomMessage).where(RoomMessage.room_id == room.id).order_by(RoomMessage.created_at.asc()))
        messages = list(result.all())
        audit.record_count = len(messages)
    return messages