from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import ClientIp, CurrentUser, DbSession, DeviceId, UserAgent
from ..models import User
from ..schemas.partner_handoff import HandoffProof, StartHandoff
from ..services import partner_handoff as service
from ..services.two_factor_service import FactorError

router = APIRouter()


@router.post("")
async def start(
    payload: StartHandoff,
    response: Response,
    user: User = CurrentUser,
    db: AsyncSession = DbSession,
    authorization: str = Header(),
    device_id=DeviceId,
):
    response.headers["Cache-Control"] = "no-store"
    try:
        return await service.start(db, user, payload, authorization, device_id)
    except FactorError as exc:
        raise HTTPException(exc.status, str(exc), headers={"Cache-Control": "no-store"}) from exc


@router.delete("/{handoff_id}", status_code=204)
async def cancel(handoff_id: UUID, user: User = CurrentUser, db: AsyncSession = DbSession):
    await service.cancel(db, user, handoff_id)


@router.post("/inspect")
async def inspect(
    payload: HandoffProof,
    response: Response,
    db: AsyncSession = DbSession,
    x_partner_handoff_secret: str | None = Header(default=None),
):
    response.headers["Cache-Control"] = "no-store"
    try:
        service.server_proof(x_partner_handoff_secret)
        return await service.inspect(db, payload.code)
    except FactorError as exc:
        raise HTTPException(exc.status, str(exc), headers={"Cache-Control": "no-store"}) from exc


@router.post("/redeem")
async def redeem(
    payload: HandoffProof,
    response: Response,
    db: AsyncSession = DbSession,
    x_partner_handoff_secret: str | None = Header(default=None),
    ip=ClientIp,
    user_agent=UserAgent,
):
    response.headers["Cache-Control"] = "no-store"
    try:
        service.server_proof(x_partner_handoff_secret)
        result = await service.redeem(db, payload.code, ip=ip, user_agent=user_agent)
        await db.commit()
        return result
    except FactorError as exc:
        raise HTTPException(exc.status, str(exc), headers={"Cache-Control": "no-store"}) from exc
