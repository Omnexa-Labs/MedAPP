from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from ..deps import DbSession, get_current_principal
from ..schemas.partner import (
    ApplicationDocumentCreate,
    ApplicationReviewRequest,
    ApplicationStatus,
    PartnerApplicationCreate,
    PartnerApplicationList,
    PartnerApplicationOut,
    PartnerApplicationSummaryOut,
    TeamMemberCreate,
)
from ..services import (
    PartnerOnboardingError,
    add_document,
    add_team_member,
    create_application,
    get_application_summary,
    get_application,
    list_applications,
    review_application,
    submit_application,
)

router = APIRouter(prefix="/v1/onboarding", tags=["Onboarding"])


@router.post("/applications", response_model=PartnerApplicationOut, status_code=status.HTTP_201_CREATED)
async def create(
    payload: PartnerApplicationCreate,
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
):
    try:
        application = await create_application(db, principal, payload)
    except PartnerOnboardingError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return PartnerApplicationOut.model_validate(application)


@router.get("/applications", response_model=PartnerApplicationList)
async def index(
    status_filter: ApplicationStatus | None = Query(default=None, alias="status"),
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
):
    applications = await list_applications(db, principal, status_filter=status_filter)
    return PartnerApplicationList(items=[PartnerApplicationOut.model_validate(application) for application in applications])


@router.get("/summary", response_model=PartnerApplicationSummaryOut)
async def summary(
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
):
    return await get_application_summary(db, principal)


@router.get("/applications/{application_id}", response_model=PartnerApplicationOut)
async def read(
    application_id: UUID,
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
):
    try:
        application = await get_application(db, principal, application_id)
    except PartnerOnboardingError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return PartnerApplicationOut.model_validate(application)


@router.post("/applications/{application_id}/documents", response_model=PartnerApplicationOut)
async def add_doc(
    application_id: UUID,
    payload: ApplicationDocumentCreate,
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
):
    try:
        application = await add_document(db, principal, application_id, payload)
    except PartnerOnboardingError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return PartnerApplicationOut.model_validate(application)


@router.post("/applications/{application_id}/team-members", response_model=PartnerApplicationOut)
async def add_member(
    application_id: UUID,
    payload: TeamMemberCreate,
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
):
    try:
        application = await add_team_member(db, principal, application_id, payload)
    except PartnerOnboardingError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return PartnerApplicationOut.model_validate(application)


@router.post("/applications/{application_id}/submit", response_model=PartnerApplicationOut)
async def submit(
    application_id: UUID,
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
):
    try:
        application = await submit_application(db, principal, application_id)
    except PartnerOnboardingError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return PartnerApplicationOut.model_validate(application)


@router.post("/applications/{application_id}/review", response_model=PartnerApplicationOut)
async def review(
    application_id: UUID,
    payload: ApplicationReviewRequest,
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
):
    try:
        application = await review_application(db, principal, application_id, payload)
    except PartnerOnboardingError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return PartnerApplicationOut.model_validate(application)