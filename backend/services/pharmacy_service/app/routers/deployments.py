from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Response
from pydantic import BaseModel, ConfigDict
from shared.auth import Principal
from sqlalchemy import select

from ..config import settings
from ..deps import CurrentPrincipal, DbSession
from ..models import PharmacyDeployment, PharmacyProfile
from ..services.deployment_service import approved_profile, assign_deployment, operator

router = APIRouter(prefix="/v1/pharmacy-workspaces", tags=["pharmacy deployments"])


class Assignment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    deployment_key: str


class AssignmentOut(BaseModel):
    pharmacy_id: UUID
    deployment_key: str | None
    version: int
    activated_at: datetime | None = None


class OwnerWorkspace(BaseModel):
    pharmacy_id: UUID
    pharmacy_name: str
    deployment_key: str
    web_origin: str


async def owner_workspaces(db, principal):
    try:
        owner_id = UUID(principal.subject)
    except (ValueError, TypeError) as exc:
        raise HTTPException(401, "invalid account") from exc
    rows = await db.execute(
        select(PharmacyProfile, PharmacyDeployment)
        .join(PharmacyDeployment, PharmacyDeployment.pharmacy_id == PharmacyProfile.id)
        .where(
            PharmacyProfile.user_id == owner_id,
            PharmacyProfile.is_active.is_(True),
            PharmacyDeployment.activated_at.is_not(None),
        )
        .order_by(PharmacyProfile.name, PharmacyProfile.id)
    )
    result = []
    for profile, binding in rows:
        deployment = settings.pms_deployments.get(binding.deployment_key)
        if deployment:
            await approved_profile(db, profile.id)
            result.append(
                OwnerWorkspace(
                    pharmacy_id=profile.id,
                    pharmacy_name=profile.name,
                    deployment_key=binding.deployment_key,
                    web_origin=deployment.web_origin,
                )
            )
    return result


@router.get("", response_model=list[OwnerWorkspace])
async def owned(response: Response, principal: Principal = CurrentPrincipal, db=DbSession):
    response.headers["Cache-Control"] = "private, no-store"
    return await owner_workspaces(db, principal)


@router.get("/{pharmacy_id}/access", response_model=OwnerWorkspace)
async def access(
    pharmacy_id: UUID, response: Response, principal: Principal = CurrentPrincipal, db=DbSession
):
    response.headers["Cache-Control"] = "private, no-store"
    for workspace in await owner_workspaces(db, principal):
        if workspace.pharmacy_id == pharmacy_id:
            return workspace
    raise HTTPException(404, "pharmacy workspace is unavailable")


def snapshot(pharmacy_id, binding):
    return AssignmentOut(
        pharmacy_id=pharmacy_id,
        deployment_key=binding.deployment_key if binding else None,
        version=binding.version if binding else 0,
        activated_at=binding.activated_at if binding else None,
    )


@router.get("/deployments")
async def deployments(response: Response, principal: Principal = CurrentPrincipal, db=DbSession):
    operator(principal)
    response.headers["Cache-Control"] = "no-store"
    used = set((await db.scalars(select(PharmacyDeployment.deployment_key))).all())
    return [
        {"deployment_key": key, "label": item.label, "assigned": key in used}
        for key, item in sorted(settings.pms_deployments.items())
    ]


@router.get("/{pharmacy_id}/deployment", response_model=AssignmentOut)
async def read(
    pharmacy_id: UUID, response: Response, principal: Principal = CurrentPrincipal, db=DbSession
):
    operator(principal)
    await approved_profile(db, pharmacy_id)
    binding = await db.scalar(
        select(PharmacyDeployment).where(PharmacyDeployment.pharmacy_id == pharmacy_id)
    )
    response.headers["Cache-Control"] = "no-store"
    return snapshot(pharmacy_id, binding)


@router.put("/{pharmacy_id}/deployment", response_model=AssignmentOut)
async def assign(
    pharmacy_id: UUID,
    payload: Assignment,
    response: Response,
    principal: Principal = CurrentPrincipal,
    if_match: str | None = Header(default=None),
    db=DbSession,
):
    operator(principal)
    if if_match is None:
        raise HTTPException(428, "If-Match is required")
    if not if_match.isdigit():
        raise HTTPException(422, "If-Match must be a nonnegative version")
    binding = await assign_deployment(
        db, principal, pharmacy_id, payload.deployment_key, int(if_match)
    )
    response.headers["Cache-Control"] = "no-store"
    return snapshot(pharmacy_id, binding)
