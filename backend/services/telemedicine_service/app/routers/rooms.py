from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import CurrentPrincipalDep, DbSession
from ..schemas.room import RoomCreate, RoomJoinOut, RoomMessageCreate, RoomMessageOut, RoomOut, RoomTokenOut
from ..services.room_service import create_room, end_room, generate_room_token, get_room, join_room, leave_room, list_messages, post_message

router = APIRouter(prefix="/v1/rooms", tags=["Rooms"])


@router.post("", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
async def create(payload: RoomCreate, session: AsyncSession = DbSession, principal=CurrentPrincipalDep):
    room = await create_room(session, principal, payload)
    return room


@router.get("/{room_id}", response_model=RoomOut)
async def read(room_id: UUID, session: AsyncSession = DbSession, principal=CurrentPrincipalDep):
    return await get_room(session, principal, room_id)


@router.get("/{room_id}/token", response_model=RoomTokenOut)
async def token(room_id: UUID, session: AsyncSession = DbSession, principal=CurrentPrincipalDep):
    token_value, expires_at = await generate_room_token(session, principal, room_id)
    room = await get_room(session, principal, room_id)
    return {"room_id": room.id, "token": token_value, "expires_at": expires_at}


@router.post("/{room_id}/join", response_model=RoomJoinOut)
async def join(room_id: UUID, session: AsyncSession = DbSession, principal=CurrentPrincipalDep, x_room_token: str | None = Header(default=None, alias="X-Room-Token")):
    if not x_room_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing room token")
    participant = await join_room(session, principal, room_id, x_room_token)
    return participant


@router.post("/{room_id}/leave", response_model=RoomJoinOut)
async def leave(room_id: UUID, session: AsyncSession = DbSession, principal=CurrentPrincipalDep, x_room_token: str | None = Header(default=None, alias="X-Room-Token")):
    if not x_room_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing room token")
    participant = await leave_room(session, principal, room_id, x_room_token)
    return participant


@router.post("/{room_id}/end", response_model=RoomOut)
async def end(room_id: UUID, session: AsyncSession = DbSession, principal=CurrentPrincipalDep, x_room_token: str | None = Header(default=None, alias="X-Room-Token")):
    if not x_room_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing room token")
    return await end_room(session, principal, room_id, x_room_token)


@router.get("/{room_id}/messages", response_model=list[RoomMessageOut])
async def messages(room_id: UUID, session: AsyncSession = DbSession, principal=CurrentPrincipalDep):
    return await list_messages(session, principal, room_id)


@router.post("/{room_id}/messages", response_model=RoomMessageOut)
async def create_message(room_id: UUID, payload: RoomMessageCreate, session: AsyncSession = DbSession, principal=CurrentPrincipalDep, x_room_token: str | None = Header(default=None, alias="X-Room-Token")):
    if not x_room_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing room token")
    return await post_message(session, principal, room_id, x_room_token, payload)