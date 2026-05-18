from fastapi import APIRouter
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import CurrentPrincipalDep, DbSession
from ..schemas.notification import InboxList, NotificationPreferenceOut, NotificationPreferenceUpdate
from ..services.notification_service import get_or_create_preferences, list_inbox, update_preferences

router = APIRouter(prefix="/v1/me", tags=["Me"])


@router.get("/preferences", response_model=NotificationPreferenceOut)
async def read_preferences(session: AsyncSession = DbSession, principal=CurrentPrincipalDep):
    return await get_or_create_preferences(session, principal)


@router.put("/preferences", response_model=NotificationPreferenceOut)
async def write_preferences(payload: NotificationPreferenceUpdate, session: AsyncSession = DbSession, principal=CurrentPrincipalDep):
    return await update_preferences(session, principal, payload)


@router.get("/inbox", response_model=InboxList)
async def inbox(session: AsyncSession = DbSession, principal=CurrentPrincipalDep):
    return {"items": await list_inbox(session, principal)}