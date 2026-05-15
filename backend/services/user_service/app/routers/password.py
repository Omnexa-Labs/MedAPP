from fastapi import APIRouter, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import CurrentUser, DbSession
from ..models import User
from ..schemas import ChangePasswordRequest, ForgotPasswordRequest, ResetPasswordRequest
from ..services import auth_service
from ..services.notifiers import EmailNotifier, LogEmailNotifier

router = APIRouter()


# Mirror the SMS-notifier override pattern from deps.py: routers should be
# overridable in tests. Inline here since email is currently only used here.
def _email_notifier() -> EmailNotifier:
    return LogEmailNotifier()


@router.post("/forgot", status_code=status.HTTP_202_ACCEPTED)
async def forgot(payload: ForgotPasswordRequest, db: AsyncSession = DbSession) -> dict:
    """Always returns 202, even if the email isn't registered, to avoid
    enumerating accounts."""
    result = await auth_service.request_password_reset(db, payload.email)
    if result:
        user, raw_token = result
        notifier = _email_notifier()
        await notifier.send(
            email=user.email,
            subject="Reset your MedApp password",
            body=f"Use this token within 30 minutes: {raw_token}",
        )
    return {"status": "ok"}


@router.post("/reset", status_code=status.HTTP_200_OK)
async def reset(payload: ResetPasswordRequest, db: AsyncSession = DbSession) -> dict:
    try:
        await auth_service.reset_password(db, payload.token, payload.new_password)
    except auth_service.AuthError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return {"status": "ok"}


@router.post("/change", status_code=status.HTTP_204_NO_CONTENT)
async def change(
    payload: ChangePasswordRequest,
    user: User = CurrentUser,
    db: AsyncSession = DbSession,
) -> None:
    try:
        await auth_service.change_password(db, user, payload.current_password, payload.new_password)
    except auth_service.AuthError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
