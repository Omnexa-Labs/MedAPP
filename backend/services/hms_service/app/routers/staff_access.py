from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import HmsPrincipal, get_hms_principal, get_mgmt_db, get_tenant_db
from ..schemas.staff_access import InvitationCode, InvitationCreate, MembershipChange
from ..services import staff_access as service
from ..session_tokens import platform_claims, require_workspace_sessions
from . import workspace_sessions

router = APIRouter(tags=["staff onboarding"])
ManagementDb = Annotated[AsyncSession, Depends(get_mgmt_db)]
StaffDb = Annotated[AsyncSession, Depends(get_tenant_db)]
StaffPrincipal = Annotated[HmsPrincipal, Depends(get_hms_principal)]


async def account(authorization: str | None = Header(default=None)):
    require_workspace_sessions()
    claims = platform_claims(authorization)
    return await workspace_sessions.verify_account(authorization, claims["sub"])


Account = Annotated[dict, Depends(account)]


@router.post("/v1/team/invitations", status_code=201)
async def create_invitation(
    payload: InvitationCreate,
    db: ManagementDb,
    staff_db: StaffDb,
    principal: StaffPrincipal,
    response: Response,
):
    result = await service.create_invitation(db, staff_db, principal, payload)
    await db.commit()
    response.headers["Cache-Control"] = "no-store"
    return result


@router.get("/v1/team/invitations")
async def invitations(
    db: ManagementDb,
    principal: StaffPrincipal,
    response: Response,
    offset: int = Query(default=0, ge=0),
):
    response.headers["Cache-Control"] = "no-store"
    return await service.list_invitations(db, principal, offset)


@router.delete("/v1/team/invitations/{invitation_id}", status_code=204)
async def cancel(
    invitation_id: UUID, db: ManagementDb, principal: StaffPrincipal, response: Response
):
    await service.cancel_invitation(db, principal, invitation_id)
    await db.commit()
    response.headers["Cache-Control"] = "no-store"


@router.get("/v1/team/memberships")
async def memberships(
    db: ManagementDb,
    staff_db: StaffDb,
    principal: StaffPrincipal,
    response: Response,
    offset: int = Query(default=0, ge=0),
):
    response.headers["Cache-Control"] = "no-store"
    return await service.list_memberships(db, staff_db, principal, offset)


@router.get("/v1/team/history")
async def history(
    db: ManagementDb,
    staff_db: StaffDb,
    principal: StaffPrincipal,
    response: Response,
    offset: int = Query(default=0, ge=0),
):
    response.headers["Cache-Control"] = "no-store"
    return await service.access_history(db, staff_db, principal, offset)


@router.patch("/v1/team/memberships/{membership_id}")
async def change(
    membership_id: UUID,
    payload: MembershipChange,
    db: ManagementDb,
    principal: StaffPrincipal,
    response: Response,
):
    result = await service.change_membership(db, principal, membership_id, payload)
    await db.commit()
    response.headers["Cache-Control"] = "no-store"
    return result


@router.post("/v1/auth/staff-invitations/inspect")
async def inspect(payload: InvitationCode, user: Account, db: ManagementDb, response: Response):
    row, tenant = await service.inspect_invitation(db, payload.code, user)
    response.headers["Cache-Control"] = "no-store"
    return {
        "hospital_id": tenant.id,
        "hospital_name": tenant.hospital_name,
        "email": row.email,
        "hms_role": row.hms_role,
        "expires_at": row.expires_at,
        "accepted": row.accepted_at is not None,
    }


@router.post("/v1/auth/staff-invitations/accept")
async def accept(payload: InvitationCode, user: Account, db: ManagementDb, response: Response):
    result = await service.accept_invitation(db, payload.code, user)
    await db.commit()
    response.headers["Cache-Control"] = "no-store"
    return result
