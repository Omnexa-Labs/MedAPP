from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..deps import CurrentPrincipal, DbSession, PmsPrincipal
from ..models.core import PharmacyProfile
from ..models.workspace import MedAppWorkspace
from ..schemas.auth import LoginRequest, LoginResponse, SessionContext, StaffPublic
from ..services import auth_service

router = APIRouter(prefix="/v1/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: AsyncSession = DbSession):
    staff = await auth_service.authenticate(body.email, body.password, db)
    if staff is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")
    token = await auth_service.local_session(staff, db)
    return LoginResponse(
        access_token=token,
        user=StaffPublic(
            id=str(staff.id),
            full_name=staff.full_name,
            email=staff.email,
            role=staff.role,
        ),
    )


@router.get("/me", response_model=StaffPublic)
async def me(principal: PmsPrincipal = CurrentPrincipal):
    return StaffPublic(
        id=principal.subject,
        full_name=principal.full_name,
        email=principal.email,
        role=principal.role,
    )


@router.get("/context", response_model=SessionContext)
async def context(
    response: Response, principal: PmsPrincipal = CurrentPrincipal, db: AsyncSession = DbSession
):
    response.headers["Cache-Control"] = "private, no-store"
    workspace = await db.scalar(select(MedAppWorkspace))
    profile = (
        await db.get(PharmacyProfile, workspace.pharmacy_id)
        if workspace
        else await db.scalar(
            select(PharmacyProfile).where(PharmacyProfile.slug == settings.pharmacy_slug)
        )
    )
    return {
        "user": {
            "id": principal.subject,
            "full_name": principal.full_name,
            "email": principal.email,
            "role": principal.role,
        },
        "pharmacy": {
            "id": str(profile.id) if profile else None,
            "name": profile.name if profile else settings.pharmacy_name,
            "deployment_key": workspace.deployment_key if workspace else None,
        },
        "expires_at": datetime.fromtimestamp(principal.expires_at, UTC),
    }
