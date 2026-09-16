import smtplib

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..deps import DbSession, EmailDep, SmsDep
from ..schemas import (
    OtpStartRequest,
    OtpStartResponse,
    OtpVerifyRequest,
    SignupOtpStartRequest,
    SignupOtpVerifyRequest,
    SignupOtpVerifyResponse,
    TokenPair,
)
from ..services import EmailNotifier, SmsNotifier, otp_service
from ..services.auth_service import AuthError
from ..services.notifiers import EmailDeliveryError

router = APIRouter()


# ── Passwordless-login OTP (existing phone user) ────────────────────────────


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
            channel=otp_service.CHANNEL_SMS,
            sms=sms,
        )
    except AuthError as exc:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, str(exc)) from exc
    return OtpStartResponse(
        sent=True, expires_in=ttl, resend_after_seconds=settings.otp_resend_cooldown_seconds
    )


@router.post("/verify", response_model=TokenPair)
async def verify(
    payload: OtpVerifyRequest, db: AsyncSession = DbSession
) -> TokenPair | JSONResponse:
    try:
        _user, tokens = await otp_service.verify_otp_and_login(
            db, phone=payload.phone, code=payload.code
        )
    except AuthError as exc:
        # Return expected rejections so get_db commits the failed attempt.
        # Raising HTTPException would roll back the attempt counter.
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST, content={"detail": str(exc)}
        )
    return tokens


# ── Signup-verify OTP (no existing user; phone OR email) ────────────────────


@router.post("/signup-start", response_model=OtpStartResponse)
async def signup_start(
    payload: SignupOtpStartRequest,
    db: AsyncSession = DbSession,
    sms: SmsNotifier = SmsDep,
    email: EmailNotifier = EmailDep,
) -> OtpStartResponse:
    """Begin signup-time contact verification.

    Refuses if the contact already belongs to an existing user — avoids
    OTP-delivery enumeration AND prevents accidental collisions with a
    user who is signing up a second time.
    """
    try:
        ttl = await otp_service.start_signup_otp(
            db,
            channel=payload.channel,
            recipient=payload.recipient,
            sms=sms,
            email=email,
        )
    except AuthError as exc:
        # 409 for "contact in use" so the client can map it to a UI hint
        # ("looks like you already have an account") without confusing it
        # with a rate-limit (429).
        msg = str(exc)
        if "already in use" in msg:
            raise HTTPException(status.HTTP_409_CONFLICT, msg) from exc
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, msg) from exc
    except (EmailDeliveryError, OSError, smtplib.SMTPException) as exc:
        # Roll back the undelivered code so delivery can be retried immediately.
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Email verification is temporarily unavailable. Please try again later.",
        ) from exc
    return OtpStartResponse(
        sent=True, expires_in=ttl, resend_after_seconds=settings.otp_resend_cooldown_seconds
    )


@router.post("/signup-verify", response_model=SignupOtpVerifyResponse)
async def signup_verify(
    payload: SignupOtpVerifyRequest, db: AsyncSession = DbSession
) -> SignupOtpVerifyResponse | JSONResponse:
    try:
        token = await otp_service.verify_signup_otp(
            db,
            channel=payload.channel,
            recipient=payload.recipient,
            code=payload.code,
        )
    except AuthError as exc:
        # Preserve failed attempts while retaining rollback for unexpected errors.
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST, content={"detail": str(exc)}
        )
    return SignupOtpVerifyResponse(
        verification_token=token,
        expires_in=otp_service.SIGNUP_VERIFY_TOKEN_TTL_MINUTES * 60,
    )
