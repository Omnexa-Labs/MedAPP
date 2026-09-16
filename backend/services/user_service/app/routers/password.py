from fastapi import APIRouter, HTTPException, status
from shared.observability import get_logger
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..deps import CurrentUser, DbSession, EmailDep
from ..models import User
from ..schemas import ChangePasswordRequest, ForgotPasswordRequest, ResetPasswordRequest
from ..services import auth_service
from ..services.notifiers import EmailDeliveryError, EmailNotifier

router = APIRouter()
log = get_logger(__name__)


@router.post("/forgot", status_code=status.HTTP_202_ACCEPTED)
async def forgot(
    payload: ForgotPasswordRequest,
    db: AsyncSession = DbSession,
    notifier: EmailNotifier = EmailDep,
) -> dict:
    """Always returns 202, even if the email isn't registered, to avoid
    enumerating accounts."""
    result = await auth_service.request_password_reset(db, payload.email)
    if result:
        user, raw_token = result
        try:
            await notifier.send(
                email=user.email,
                subject="Reset your MedApp password",
                body=(
                    "Enter this reset code on MedApp's password recovery screen:\n\n"
                    f"{raw_token}\n\n"
                    f"It expires in {settings.password_reset_ttl_minutes} minutes and can be used once.\n"
                    "If you did not request this, you can ignore this email."
                ),
            )
        except EmailDeliveryError:
            # A per-recipient failure must not disclose whether the account exists.
            # Operators get a transport event, never the reset code or email body.
            log.warning("password_reset.email_delivery_failed")
    return {"status": "ok", "resend_after_seconds": settings.password_reset_resend_cooldown_seconds}


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
