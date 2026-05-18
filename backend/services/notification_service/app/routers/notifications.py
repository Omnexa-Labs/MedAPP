from uuid import UUID

from fastapi import APIRouter
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import CurrentPrincipalDep, DbSession
from ..schemas.notification import NotificationDeliveryOut, SendNotificationIn
from ..services.notification_service import send_notification

router = APIRouter(prefix="/v1/notifications", tags=["Notifications"])


@router.post("/send", response_model=list[NotificationDeliveryOut])
async def send(payload: SendNotificationIn, session: AsyncSession = DbSession, principal=CurrentPrincipalDep):
    return await send_notification(session, principal, payload)