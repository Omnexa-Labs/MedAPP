from fastapi import APIRouter, Response
from fastapi.responses import JSONResponse

from ..deps import CurrentUser, DbSession, DeviceId, ClientIp, UserAgent
from ..schemas.auth import TokenPair
from ..schemas.two_factor import CompleteChallenge, ConfirmSetup, FactorProof, PasswordProof, SetupResponse, TwoFactorStatus
from ..services import two_factor_service as service

router = APIRouter()
login_router = APIRouter()


def rejection(exc):
    # Expected proof failures must commit their durable account attempt budget.
    return JSONResponse(status_code=exc.status, content={"detail": str(exc)},
                        headers={"Cache-Control": "no-store"})


@router.get("", response_model=TwoFactorStatus)
async def get_status(response: Response, db=DbSession, user=CurrentUser):
    response.headers["Cache-Control"] = "no-store"
    return await service.status(db, user)


@router.post("/setup", response_model=SetupResponse)
async def setup(payload: PasswordProof, response: Response, db=DbSession, user=CurrentUser):
    response.headers["Cache-Control"] = "no-store"
    try:
        return await service.start_setup(db, user, payload.current_password)
    except service.FactorError as exc:
        return rejection(exc)


@router.post("/confirm", status_code=204)
async def confirm(payload: ConfirmSetup, db=DbSession, user=CurrentUser):
    try:
        await service.confirm_setup(db, user, payload.setup_id, payload.code)
    except service.FactorError as exc:
        return rejection(exc)


@router.post("/disable", status_code=204)
async def disable(payload: FactorProof, db=DbSession, user=CurrentUser):
    try:
        await service.manage(db, user, payload.current_password, payload.code, disable=True)
    except service.FactorError as exc:
        return rejection(exc)


@router.post("/recovery-codes")
async def regenerate(payload: FactorProof, response: Response, db=DbSession, user=CurrentUser):
    response.headers["Cache-Control"] = "no-store"
    try:
        return {"recovery_codes": await service.manage(db, user, payload.current_password, payload.code)}
    except service.FactorError as exc:
        return rejection(exc)


@login_router.post("/verify", response_model=TokenPair)
async def verify(payload: CompleteChallenge, response: Response, db=DbSession,
                 device_id=DeviceId, ip=ClientIp, ua=UserAgent):
    response.headers["Cache-Control"] = "no-store"
    try:
        return await service.complete_login(db, payload.challenge_token, payload.code,
                                             device_id=device_id, ip=ip, user_agent=ua)
    except service.FactorError as exc:
        return rejection(exc)
