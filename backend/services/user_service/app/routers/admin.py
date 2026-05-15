from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from .. import events
from ..deps import DbSession, require_role
from ..models import User
from ..schemas import KycReviewRequest, KycSubmissionOut, UserOut
from ..services import kyc_service

router = APIRouter()
AdminOnly = Depends(require_role("admin", "hospital_admin"))


# Admins need to see the pending queue before they can review it.
@router.get("/kyc/pending", response_model=list[KycSubmissionOut])
async def list_pending_kyc(
    db: AsyncSession = DbSession,
    _admin: User = AdminOnly,
) -> list[KycSubmissionOut]:
    rows = await kyc_service.list_pending(db)
    return [KycSubmissionOut.model_validate(r) for r in rows]


@router.post("/kyc/{submission_id}/review", response_model=KycSubmissionOut)
async def review_kyc(
    submission_id: UUID,
    payload: KycReviewRequest,
    request: Request,
    db: AsyncSession = DbSession,
    admin: User = AdminOnly,
) -> KycSubmissionOut:
    try:
        sub = await kyc_service.review(
            db,
            submission_id,
            admin,
            approve=payload.approve,
            rejection_reason=payload.rejection_reason,
        )
    except kyc_service.KycError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    # Commit first so downstream consumers never process a review that gets rolled back.
    await db.commit()
    event_type = "user.kyc_approved" if payload.approve else "user.kyc_rejected"
    await events.publish(
        request.app,
        event_type=event_type,
        subject=str(sub.user_id),
        data={
            "submission_id": str(sub.id),
            "role": sub.submitted_role,
            "rejection_reason": sub.rejection_reason,
        },
    )
    return KycSubmissionOut.model_validate(sub)
