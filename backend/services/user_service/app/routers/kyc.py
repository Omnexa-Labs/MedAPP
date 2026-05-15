from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from .. import events
from ..deps import CurrentUser, DbSession
from ..models import User
from ..schemas import KycSubmissionOut, KycSubmitRequest
from ..services import kyc_service

router = APIRouter()


# POST "/me/kyc" creates a new submission for the authenticated user.
@router.post("", response_model=KycSubmissionOut, status_code=status.HTTP_201_CREATED)
async def submit(
    payload: KycSubmitRequest,
    request: Request,
    user: User = CurrentUser,
    db: AsyncSession = DbSession,
) -> KycSubmissionOut:
    try:
        sub = await kyc_service.submit(db, user, payload)
    except kyc_service.KycError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    # Persist the row before emitting the event so consumers never see a phantom submission.
    await db.commit()
    await events.publish(
        request.app,
        event_type="user.kyc_submitted",
        subject=str(user.id),
        data={"submission_id": str(sub.id), "target_role": sub.submitted_role},
    )
    return KycSubmissionOut.model_validate(sub)


# GET "/me/kyc" returns the latest submission for the authenticated user.
@router.get("", response_model=KycSubmissionOut | None)
async def my_kyc(
    user: User = CurrentUser,
    db: AsyncSession = DbSession,
) -> KycSubmissionOut | None:
    sub = await kyc_service.latest_for_user(db, user.id)
    return KycSubmissionOut.model_validate(sub) if sub else None
