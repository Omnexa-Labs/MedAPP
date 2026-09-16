from fastapi import APIRouter, Response

from ..deps import ClientIp, DbSession, DeviceId, UserAgent
from ..schemas.provider_auth import CompleteProvider
from ..schemas.two_factor import CompleteChallenge
from ..services import admin_sso as service
from ..services.two_factor_service import FactorError
from .two_factor import rejection

router = APIRouter()


@router.get("/config")
async def configuration(response: Response):
    response.headers["Cache-Control"] = "no-store"
    return service.configuration()


@router.post("/begin")
async def begin(response: Response, db=DbSession, device_id=DeviceId):
    response.headers["Cache-Control"] = "no-store"
    try:
        return await service.begin(db, device_id)
    except FactorError as exc:
        return rejection(exc)


@router.post("/complete")
async def complete(
    payload: CompleteProvider,
    response: Response,
    db=DbSession,
    device_id=DeviceId,
    ip=ClientIp,
    ua=UserAgent,
):
    response.headers["Cache-Control"] = "no-store"
    try:
        return await service.finish(db, payload, device_id=device_id, ip=ip, user_agent=ua)
    except FactorError as exc:
        return rejection(exc)


@router.post("/verify")
async def verify(
    payload: CompleteChallenge,
    response: Response,
    db=DbSession,
    device_id=DeviceId,
    ip=ClientIp,
    ua=UserAgent,
):
    response.headers["Cache-Control"] = "no-store"
    try:
        return await service.verify_factor(db, payload, device_id=device_id, ip=ip, user_agent=ua)
    except FactorError as exc:
        return rejection(exc)
