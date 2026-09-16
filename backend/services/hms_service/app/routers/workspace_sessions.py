from datetime import UTC, datetime
from typing import Annotated
from urllib.parse import urlsplit
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..deps import get_mgmt_db
from ..models.mgmt import HmsRoleEnum, HmsStaffRole, TenantRegistry
from ..session_tokens import issue_workspace_session, platform_claims, require_workspace_sessions

router = APIRouter(prefix="/v1/auth", tags=["workspace sessions"])


async def verify_account(authorization, subject):
    try:
        origin = urlsplit(settings.user_service_url)
        if (
            origin.scheme not in {"http", "https"}
            or not origin.hostname
            or origin.username
            or origin.password
            or origin.query
            or origin.fragment
        ):
            raise ValueError()
    except ValueError:
        raise HTTPException(503, "MedApp identity service is not configured") from None
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(10, connect=3), trust_env=False, follow_redirects=False
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
        account = response.json()
        if UUID(account["id"]) != UUID(subject) or account["is_active"] is not True:
            raise ValueError()
    except (ValueError, KeyError, TypeError, AttributeError):
        raise HTTPException(401, "MedApp session could not be confirmed") from None
    return account


async def current_platform_session(authorization: str | None = Header(default=None)):
    require_workspace_sessions()
    claims = platform_claims(authorization)
    await verify_account(authorization, claims["sub"])
    return claims


class Workspace(BaseModel):
    hospital_id: UUID
    hospital_name: str
    hms_role: HmsRoleEnum


class WorkspaceSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    hospital_id: UUID


class WorkspaceSession(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    user_id: UUID
    workspace: Workspace


def accessible_workspaces(subject):
    return (
        select(TenantRegistry, HmsStaffRole.hms_role)
        .join(HmsStaffRole, HmsStaffRole.tenant_id == TenantRegistry.id)
        .where(
            HmsStaffRole.user_id == UUID(subject),
            HmsStaffRole.is_active.is_(True),
            HmsStaffRole.hms_role.in_([role.value for role in HmsRoleEnum]),
            TenantRegistry.is_active.is_(True),
            TenantRegistry.provisioned_at.is_not(None),
        )
    )


@router.get("/workspaces", response_model=list[Workspace])
async def workspaces(
    response: Response,
    parent: Annotated[dict, Depends(current_platform_session)],
    db: Annotated[AsyncSession, Depends(get_mgmt_db)],
):
    response.headers["Cache-Control"] = "no-store"
    rows = (
        await db.execute(
            accessible_workspaces(parent["sub"]).order_by(
                TenantRegistry.hospital_name, TenantRegistry.id
            )
        )
    ).all()
    return [
        Workspace(hospital_id=tenant.id, hospital_name=tenant.hospital_name, hms_role=role)
        for tenant, role in rows
    ]


@router.post("/workspace-session", response_model=WorkspaceSession)
async def exchange(
    payload: WorkspaceSelection,
    response: Response,
    parent: Annotated[dict, Depends(current_platform_session)],
    db: Annotated[AsyncSession, Depends(get_mgmt_db)],
):
    row = (
        await db.execute(
            accessible_workspaces(parent["sub"]).where(TenantRegistry.id == payload.hospital_id)
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(404, "workspace not found")
    tenant, role = row
    token, expires = issue_workspace_session(parent, tenant.id)
    response.headers["Cache-Control"] = "no-store"
    return WorkspaceSession(
        access_token=token,
        expires_at=datetime.fromtimestamp(expires, UTC),
        user_id=UUID(parent["sub"]),
        workspace=Workspace(
            hospital_id=tenant.id, hospital_name=tenant.hospital_name, hms_role=role
        ),
    )
