from fastapi import APIRouter, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import DbSession, SmsDep
from ..schemas import OtpStartRequest, OtpStartResponse, OtpVerifyRequest, TokenPair
from ..services import SmsNotifier, otp_service
from ..services.auth_service import AuthError

router = APIRouter()


@router.post("/start", response_model=OtpStartResponse)
async def start(
    payload: OtpStartRequest,
    db: AsyncSession = DbSession,
    sms: SmsNotifier = SmsDep,
) -> OtpStartResponse:
    try:
        ttl = await otp_service.start_otp(
            db,
            recipient=payload.phone,
            purpose=payload.purpose,
            channel="sms",
            sms=sms,
        )
    except AuthError as exc:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, str(exc)) from exc
    return OtpStartResponse(sent=True, expires_in=ttl)


@router.post("/verify", response_model=TokenPair)
async def verify(payload: OtpVerifyRequest, db: AsyncSession = DbSession) -> TokenPair:
    try:
        _user, tokens = await otp_service.verify_otp_and_login(
            db, phone=payload.phone, code=payload.code
        )
    except AuthError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return tokens
