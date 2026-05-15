"""KYC submission state machine.

States: pending -> submitted -> under_review -> approved | rejected

Generic app users have kyc_status = "not_required" and never enter this flow.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import KycSubmission, User
from ..schemas import KycSubmitRequest


class KycError(Exception):
    pass


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


_KYC_ROLES = {"doctor", "nurse", "hospital_admin"}


async def submit(db: AsyncSession, user: User, payload: KycSubmitRequest) -> KycSubmission:
    # Only supported roles can enter the KYC workflow.
    if payload.target_role not in _KYC_ROLES:
        raise KycError("KYC not required for this role")
    # Generic users may request an upgrade, but arbitrary roles still cannot.
    if user.role not in _KYC_ROLES and user.role != "user":
        raise KycError("invalid current role for KYC")
    # If the user is currently a generic user requesting an upgrade, store the target
    # role; the actual role bump happens on approval.
    if user.kyc_status == "approved":
        raise KycError("already approved")

    submission = KycSubmission(
        user_id=user.id,
        status="submitted",
        submitted_role=payload.target_role,
        documents=[d.model_dump() for d in payload.documents],
    )
    db.add(submission)
    user.kyc_status = "submitted"
    await db.flush()
    return submission


async def list_pending(db: AsyncSession, limit: int = 50) -> list[KycSubmission]:
    rows = await db.scalars(
        select(KycSubmission)
        .where(KycSubmission.status.in_(("submitted", "under_review")))
        .order_by(KycSubmission.created_at)
        .limit(limit)
    )
    return list(rows)


async def latest_for_user(db: AsyncSession, user_id: UUID) -> KycSubmission | None:
    return await db.scalar(
        select(KycSubmission)
        .where(KycSubmission.user_id == user_id)
        .order_by(desc(KycSubmission.created_at))
        .limit(1)
    )


async def review(
    db: AsyncSession,
    submission_id: UUID,
    reviewer: User,
    *,
    approve: bool,
    rejection_reason: str | None = None,
) -> KycSubmission:
    sub = await db.get(KycSubmission, submission_id)
    if not sub:
        raise KycError("submission not found")
    # A reviewer must never be able to approve or reject their own submission.
    if sub.user_id == reviewer.id:
        raise KycError("cannot review own submission")
    if sub.status not in {"submitted", "under_review"}:
        raise KycError(f"cannot review submission in status {sub.status}")
    sub.reviewed_by = reviewer.id
    sub.reviewed_at = _now()
    if approve:
        sub.status = "approved"
        sub.rejection_reason = None
        target = await db.get(User, sub.user_id)
        if target is not None:
            target.role = sub.submitted_role
            target.kyc_status = "approved"
    else:
        if not rejection_reason:
            raise KycError("rejection_reason required")
        sub.status = "rejected"
        sub.rejection_reason = rejection_reason
        target = await db.get(User, sub.user_id)
        if target is not None:
            target.kyc_status = "rejected"
    return sub
