from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import CurrentPrincipal, DbSession, PmsPrincipal, get_db
from ..schemas.auth import LoginRequest, LoginResponse, StaffPublic
from ..services import auth_service

router = APIRouter(prefix="/v1/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: AsyncSession = DbSession):
    staff = await auth_service.authenticate(body.email, body.password, db)
    if staff is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")
    token = auth_service.issue_token(staff)
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
        full_name=principal.email.split("@")[0],
        email=principal.email,
        role=principal.role,
    )
