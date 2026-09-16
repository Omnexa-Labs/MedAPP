from typing import Annotated
from urllib.parse import urlsplit
from uuid import UUID

import httpx
import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel, EmailStr, Field, ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from ..config import settings
from ..deps import DbSession
from ..models.core import Staff
from ..models.workspace import MedAppMembership, MedAppWorkspace
from ..schemas.auth import LoginResponse, StaffPublic
from ..services.auth_service import issue_token
from .activation import workspace_lock

router = APIRouter(prefix="/v1/auth", tags=["MedApp sessions"])


class VerifiedAccount(BaseModel):
    id: UUID
    email: EmailStr
    first_name: str = Field(min_length=1, max_length=255)
    last_name: str = Field(min_length=1, max_length=255)
    email_verified: bool
    is_active: bool


async def verify_account(authorization, subject):
    origin = urlsplit(settings.user_service_url)
    if (
        origin.scheme not in {"http", "https"}
        or not origin.hostname
        or origin.username
        or origin.password
        or origin.query
        or origin.fragment
        or origin.path not in {"", "/"}
    ):
        raise HTTPException(503, "MedApp identity service is not configured")
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(10, connect=3), follow_redirects=False, trust_env=False
        ) as client:
            response = await client.get(
                settings.user_service_url.rstrip("/") + "/me",
                headers={"Authorization": authorization},
            )
    except httpx.RequestError:
        raise HTTPException(503, "MedApp identity service is unavailable") from None
    if response.status_code in {401, 403}:
        raise HTTPException(401, "MedApp session is unavailable")
    if response.status_code != 200:
        raise HTTPException(503, "MedApp identity service is unavailable")
    try:
        account = VerifiedAccount.model_validate_json(response.content, strict=True)
        if str(account.id) != subject or not account.is_active or not account.email_verified:
            raise ValueError()
    except (ValueError, ValidationError):
        raise HTTPException(401, "verified MedApp account is required") from None
    return account


async def platform_session(authorization: str | None = Header(default=None)):
    secret = settings.medapp_jwt_secret.get_secret_value()
    if (
        len(secret) < 32
        or len(settings.jwt_secret) < 32
        or secret == settings.jwt_secret
        or not settings.medapp_deployment_key
    ):
        raise HTTPException(503, "MedApp sessions are not configured")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "MedApp bearer token is required")
    try:
        parent = jwt.decode(
            authorization.split(" ", 1)[1],
            secret,
            algorithms=[settings.medapp_jwt_algorithm],
            audience=settings.medapp_jwt_audience,
            issuer=settings.medapp_jwt_issuer,
            options={"require": ["sub", "iat", "exp", "aud", "iss", "typ"]},
        )
        UUID(parent["sub"])
        if parent["typ"] != "access":
            raise ValueError()
    except (jwt.InvalidTokenError, ValueError, TypeError):
        raise HTTPException(401, "invalid MedApp session") from None
    return parent, await verify_account(authorization, parent["sub"])


@router.post("/medapp-session", response_model=LoginResponse)
async def exchange(
    response: Response, identity: Annotated[tuple, Depends(platform_session)], db=DbSession
):
    parent, account = identity
    await workspace_lock(db)
    workspace = await db.scalar(select(MedAppWorkspace).with_for_update())
    member = await db.scalar(
        select(MedAppMembership).where(MedAppMembership.user_id == account.id).with_for_update()
    )
    if (
        not workspace
        or not workspace.is_active
        or workspace.deployment_key != settings.medapp_deployment_key
        or workspace.owner_id != account.id
        or not member
        or not member.is_active
        or member.role != "pharmacy_admin"
    ):
        raise HTTPException(404, "pharmacy workspace not found")
    if member.staff_id:
        staff = await db.get(Staff, member.staff_id)
        if not staff or not staff.is_active or staff.role != member.role:
            raise HTTPException(403, "pharmacy staff access is unavailable")
    else:
        email = str(account.email).lower()
        if await db.scalar(select(Staff.id).where(func.lower(Staff.email) == email)):
            raise HTTPException(409, "an existing staff identity requires reconciliation")
        name = f"{account.first_name.strip()} {account.last_name.strip()}".strip()
        if not name or len(name) > 255:
            raise HTTPException(409, "MedApp staff name requires correction before activation")
        staff = Staff(
            full_name=name, email=email, role=member.role, password_hash=None, is_active=True
        )
        db.add(staff)
        try:
            await db.flush()
        except IntegrityError as exc:
            raise HTTPException(409, "staff identity requires reconciliation") from exc
        member.staff_id = staff.id
        await db.flush()
    response.headers["Cache-Control"] = "no-store"
    return LoginResponse(
        access_token=issue_token(staff, workspace=workspace, parent=parent),
        user=StaffPublic(
            id=str(staff.id), full_name=staff.full_name, email=staff.email, role=staff.role
        ),
    )
