from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from ..models import OnboardingMode, PartnerApplication, PartnerApplicationStatus, PartnerType
from ..schemas.partner import (
    ApplicationDocumentCreate,
    ApplicationReviewRequest,
    ApplicationStatus,
    PartnerApplicationCreate,
    PartnerApplicationSummaryOut,
    TeamMemberCreate,
    ReviewAction,
)


class PartnerOnboardingError(ValueError):
    pass


def _now() -> datetime:
    return datetime.now(tz=UTC)


def _principal_uuid(principal: Principal) -> UUID:
    try:
        return UUID(principal.subject)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid principal subject") from exc


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _normalize_required_text(value: str) -> str:
    trimmed = value.strip()
    if not trimmed:
        raise PartnerOnboardingError("value is required")
    return trimmed


def _require_admin(principal: Principal) -> None:
    if principal.role not in {"admin", "platform_admin"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin access required")


def _is_owner(principal: Principal, application: PartnerApplication) -> bool:
    try:
        return application.submitted_by_user_id == UUID(principal.subject)
    except ValueError:
        return False


def _ensure_owner_or_admin(principal: Principal, application: PartnerApplication) -> None:
    if not _is_owner(principal, application):
        _require_admin(principal)


def _validate_application_kind(payload: PartnerApplicationCreate) -> None:
    if payload.partner_type == PartnerType.HOSPITAL and payload.onboarding_mode is None:
        raise PartnerOnboardingError("hospital onboarding requires onboarding_mode")
    if payload.partner_type != PartnerType.HOSPITAL and payload.onboarding_mode is not None:
        raise PartnerOnboardingError("only hospital partners can use onboarding_mode")


def _application_requires_documents(application: PartnerApplication) -> bool:
    return application.partner_type in {PartnerType.HOSPITAL.value, PartnerType.PRACTITIONER.value, PartnerType.PHARMACY.value}


def _application_requires_team(application: PartnerApplication) -> bool:
    return application.partner_type == PartnerType.HOSPITAL.value and application.onboarding_mode == OnboardingMode.TEAM.value


def _document_payload(document: ApplicationDocumentCreate, principal: Principal) -> dict[str, object]:
    now = _now().isoformat()
    return {
        "document_id": str(uuid4()),
        "kind": document.kind.strip(),
        "url": document.url.strip(),
        "label": _normalize_text(document.label),
        "verified": document.verified,
        "uploaded_by_user_id": str(_principal_uuid(principal)),
        "uploaded_at": now,
    }


def _team_member_payload(member: TeamMemberCreate, principal: Principal) -> dict[str, object]:
    now = _now().isoformat()
    return {
        "member_id": str(uuid4()),
        "full_name": member.full_name.strip(),
        "user_id": str(member.user_id) if member.user_id is not None else None,
        "role": member.role.strip(),
        "title": _normalize_text(member.title),
        "specialty": _normalize_text(member.specialty),
        "email": _normalize_text(member.email),
        "phone": _normalize_text(member.phone),
        "is_primary": member.is_primary,
        "added_by_user_id": str(_principal_uuid(principal)),
        "added_at": now,
    }


async def create_application(db: AsyncSession, principal: Principal, payload: PartnerApplicationCreate) -> PartnerApplication:
    _validate_application_kind(payload)
    application = PartnerApplication(
        partner_type=payload.partner_type.value,
        onboarding_mode=payload.onboarding_mode.value if payload.onboarding_mode else None,
        legal_name=_normalize_required_text(payload.legal_name),
        display_name=_normalize_text(payload.display_name) or _normalize_required_text(payload.legal_name),
        specialty=_normalize_text(payload.specialty),
        license_number=_normalize_text(payload.license_number),
        registration_number=_normalize_text(payload.registration_number),
        tax_id=_normalize_text(payload.tax_id),
        country=_normalize_text(payload.country),
        city=_normalize_text(payload.city),
        address_line1=_normalize_text(payload.address_line1),
        email=_normalize_text(payload.email),
        phone=_normalize_text(payload.phone),
        website_url=_normalize_text(payload.website_url),
        submitted_by_user_id=_principal_uuid(principal),
        status=PartnerApplicationStatus.DRAFT.value,
        documents_json=[_document_payload(document, principal) for document in payload.documents],
        team_members_json=[_team_member_payload(member, principal) for member in payload.team_members],
        notes=_normalize_text(payload.notes),
    )
    db.add(application)
    await db.flush()
    await db.refresh(application)
    return application


async def list_applications(db: AsyncSession, principal: Principal, *, status_filter: ApplicationStatus | None = None) -> list[PartnerApplication]:
    stmt = select(PartnerApplication).order_by(PartnerApplication.created_at.desc())
    if principal.role not in {"admin", "platform_admin"}:
        stmt = stmt.where(PartnerApplication.submitted_by_user_id == _principal_uuid(principal))
    if status_filter is not None:
        stmt = stmt.where(PartnerApplication.status == status_filter.value)
    rows = await db.scalars(stmt)
    return list(rows.all())


async def get_application_summary(db: AsyncSession, principal: Principal) -> PartnerApplicationSummaryOut:
    applications = await list_applications(db, principal)
    recent_applications = applications[:3]
    statuses = {status.value: 0 for status in ApplicationStatus}
    for application in applications:
        statuses[application.status] = statuses.get(application.status, 0) + 1
    return PartnerApplicationSummaryOut(
        total_count=len(applications),
        draft_count=statuses[ApplicationStatus.DRAFT.value],
        submitted_count=statuses[ApplicationStatus.SUBMITTED.value],
        under_review_count=statuses[ApplicationStatus.UNDER_REVIEW.value],
        approved_count=statuses[ApplicationStatus.APPROVED.value],
        rejected_count=statuses[ApplicationStatus.REJECTED.value],
        recent_applications=[application for application in recent_applications],
    )


async def get_application(db: AsyncSession, principal: Principal, application_id: UUID) -> PartnerApplication:
    application = await db.get(PartnerApplication, application_id)
    if application is None:
        raise PartnerOnboardingError("application not found")
    _ensure_owner_or_admin(principal, application)
    return application


async def add_document(db: AsyncSession, principal: Principal, application_id: UUID, payload: ApplicationDocumentCreate) -> PartnerApplication:
    application = await get_application(db, principal, application_id)
    if application.status != PartnerApplicationStatus.DRAFT.value:
        raise PartnerOnboardingError("documents can only be added while the application is in draft")
    application.documents_json = [*application.documents_json, _document_payload(payload, principal)]
    await db.flush()
    await db.refresh(application)
    return application


async def add_team_member(db: AsyncSession, principal: Principal, application_id: UUID, payload: TeamMemberCreate) -> PartnerApplication:
    application = await get_application(db, principal, application_id)
    if application.status != PartnerApplicationStatus.DRAFT.value:
        raise PartnerOnboardingError("team members can only be added while the application is in draft")
    application.team_members_json = [*application.team_members_json, _team_member_payload(payload, principal)]
    await db.flush()
    await db.refresh(application)
    return application


async def submit_application(db: AsyncSession, principal: Principal, application_id: UUID) -> PartnerApplication:
    application = await get_application(db, principal, application_id)
    if application.status not in {PartnerApplicationStatus.DRAFT.value, PartnerApplicationStatus.REJECTED.value}:
        raise PartnerOnboardingError(f"cannot submit application in status {application.status}")
    if _application_requires_documents(application) and not application.documents_json:
        raise PartnerOnboardingError("at least one document is required before submission")
    if _application_requires_team(application) and not application.team_members_json:
        raise PartnerOnboardingError("team onboarding requires at least one team member")
    application.status = PartnerApplicationStatus.SUBMITTED.value
    application.submitted_at = _now()
    application.rejection_reason = None
    await db.flush()
    await db.refresh(application)
    return application


async def review_application(
    db: AsyncSession,
    principal: Principal,
    application_id: UUID,
    payload: ApplicationReviewRequest,
) -> PartnerApplication:
    _require_admin(principal)
    application = await db.get(PartnerApplication, application_id)
    if application is None:
        raise PartnerOnboardingError("application not found")
    if application.status not in {PartnerApplicationStatus.SUBMITTED.value, PartnerApplicationStatus.UNDER_REVIEW.value}:
        raise PartnerOnboardingError(f"cannot review application in status {application.status}")
    application.reviewed_by_user_id = _principal_uuid(principal)
    application.reviewed_at = _now()
    if payload.action == ReviewAction.UNDER_REVIEW:
        application.status = PartnerApplicationStatus.UNDER_REVIEW.value
    elif payload.action == ReviewAction.APPROVE:
        application.status = PartnerApplicationStatus.APPROVED.value
        application.rejection_reason = None
    else:
        if not payload.rejection_reason:
            raise PartnerOnboardingError("rejection_reason is required when rejecting an application")
        application.status = PartnerApplicationStatus.REJECTED.value
        application.rejection_reason = payload.rejection_reason.strip()
    await db.flush()
    await db.refresh(application)
    return application