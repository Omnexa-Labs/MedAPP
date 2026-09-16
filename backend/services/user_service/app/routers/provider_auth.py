from fastapi import APIRouter, Response

from ..deps import ClientIp, CurrentUser, DbSession, DeviceId, UserAgent
from ..schemas.provider_auth import BeginProvider, CompleteProvider, LinkProvider, Provider, RemoveProvider
from ..services import provider_auth as service
from ..services.two_factor_service import FactorError
from .two_factor import rejection

router = APIRouter()
account_router = APIRouter()


@router.get("/config")
async def configuration(response: Response):
    response.headers["Cache-Control"] = "no-store"
    return service.configuration()


@router.post("/begin")
async def begin(payload: BeginProvider, response: Response, db=DbSession, device_id=DeviceId):
    response.headers["Cache-Control"] = "no-store"
    try:
        return await service.begin(db, payload.provider, device_id)
    except FactorError as exc:
        return rejection(exc)


@router.post("/complete")
async def complete(payload: CompleteProvider, response: Response, db=DbSession,
                   device_id=DeviceId, ip=ClientIp, ua=UserAgent):
    response.headers["Cache-Control"] = "no-store"
    try:
        return await service.finish(db, payload, device_id=device_id, ip=ip, user_agent=ua)
    except FactorError as exc:
        return rejection(exc)


@router.post("/link")
async def link(payload: LinkProvider, response: Response, db=DbSession,
               device_id=DeviceId, ip=ClientIp, ua=UserAgent):
    response.headers["Cache-Control"] = "no-store"
    try:
        return await service.link(db, payload, device_id=device_id, ip=ip, user_agent=ua)
    except FactorError as exc:
        return rejection(exc)


@account_router.get("")
async def connections(response: Response, db=DbSession, user=CurrentUser):
    response.headers["Cache-Control"] = "no-store"
    return await service.connections(db, user)


@account_router.post("/{provider}/disconnect", status_code=204)
async def disconnect(provider: Provider, payload: RemoveProvider, response: Response,
                     db=DbSession, user=CurrentUser):
    response.headers["Cache-Control"] = "no-store"
    try:
        await service.remove(db, user, provider, payload)
    except FactorError as exc:
        return rejection(exc)
