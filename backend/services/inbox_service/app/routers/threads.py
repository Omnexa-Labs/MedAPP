from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import CurrentPrincipalDep, DbSession
from ..schemas.thread import HandoffCreate, ThreadCreate, ThreadList, ThreadMessageCreate, ThreadMessageOut, ThreadOut, ThreadParticipantOut
from ..services.thread_service import create_direct_thread, create_handoff_thread, list_messages, list_threads, mark_thread_read, post_message, read_thread_detail

router = APIRouter(prefix="/v1/threads", tags=["Threads"])


@router.post("", response_model=ThreadOut, status_code=status.HTTP_201_CREATED)
async def create(payload: ThreadCreate, session: AsyncSession = DbSession, principal=CurrentPrincipalDep):
    return await create_direct_thread(session, principal, payload)


@router.get("", response_model=ThreadList)
async def index(session: AsyncSession = DbSession, principal=CurrentPrincipalDep):
    return {"items": await list_threads(session, principal)}


@router.get("/{thread_id}", response_model=ThreadOut)
async def read(thread_id: UUID, session: AsyncSession = DbSession, principal=CurrentPrincipalDep):
    # `read_thread_detail`, not `get_thread`: the audited entry point.
    return await read_thread_detail(session, principal, thread_id)


@router.get("/{thread_id}/messages", response_model=list[ThreadMessageOut])
async def messages(thread_id: UUID, session: AsyncSession = DbSession, principal=CurrentPrincipalDep):
    return await list_messages(session, principal, thread_id)


@router.post("/{thread_id}/messages", response_model=ThreadMessageOut)
async def write(thread_id: UUID, payload: ThreadMessageCreate, session: AsyncSession = DbSession, principal=CurrentPrincipalDep):
    return await post_message(session, principal, thread_id, payload)


@router.post("/{thread_id}/read", response_model=ThreadParticipantOut)
async def read_thread(thread_id: UUID, session: AsyncSession = DbSession, principal=CurrentPrincipalDep):
    return await mark_thread_read(session, principal, thread_id)


@router.post("/handoff", response_model=ThreadOut, status_code=status.HTTP_201_CREATED)
async def handoff(payload: HandoffCreate, session: AsyncSession = DbSession, principal=CurrentPrincipalDep):
    thread, _ = await create_handoff_thread(session, principal, payload)
    return thread