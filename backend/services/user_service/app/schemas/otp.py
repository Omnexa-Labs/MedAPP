import re
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

E164 = re.compile(r"^\+[1-9]\d{6,14}$")


class OtpStartRequest(BaseModel):
    """Login OTP (existing phone user). For signup verification, use the
    /signup-start request instead — it has its own schema that supports
    both channels."""

    phone: str = Field(max_length=32)
    purpose: str = "login"  # "login" | "verify"

    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, v: str) -> str:
        if not E164.match(v):
            raise ValueError("phone must be E.164 format, e.g. +233241234567")
        return v


class OtpStartResponse(BaseModel):
    sent: bool
    expires_in: int  # seconds


class OtpVerifyRequest(BaseModel):
    phone: str
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    purpose: str = "login"


# ── Signup verification (phone OR email) ──────────────────────────────────


class SignupOtpStartRequest(BaseModel):
    """Start a signup-verify OTP. User picks one channel; the other field
    is left empty. Validation enforces exactly one is set."""

    channel: Literal["sms", "email"]
    phone: str | None = Field(default=None, max_length=32)
    email: EmailStr | None = None

    @model_validator(mode="after")
    def _exactly_one_contact(self) -> "SignupOtpStartRequest":
        if self.channel == "sms":
            if not self.phone:
                raise ValueError("phone is required when channel is sms")
            if self.email is not None:
                raise ValueError("do not send email when channel is sms")
            if not E164.match(self.phone):
                raise ValueError("phone must be E.164 format, e.g. +233241234567")
        else:  # email
            if not self.email:
                raise ValueError("email is required when channel is email")
            if self.phone is not None:
                raise ValueError("do not send phone when channel is email")
        return self

    @property
    def recipient(self) -> str:
        return self.phone if self.channel == "sms" else str(self.email)


class SignupOtpVerifyRequest(BaseModel):
    channel: Literal["sms", "email"]
    phone: str | None = Field(default=None, max_length=32)
    email: EmailStr | None = None
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")

    @model_validator(mode="after")
    def _exactly_one_contact(self) -> "SignupOtpVerifyRequest":
        if self.channel == "sms":
            if not self.phone:
                raise ValueError("phone is required when channel is sms")
            if self.email is not None:
                raise ValueError("do not send email when channel is sms")
        else:
            if not self.email:
                raise ValueError("email is required when channel is email")
            if self.phone is not None:
                raise ValueError("do not send phone when channel is email")
        return self

    @property
    def recipient(self) -> str:
        return self.phone if self.channel == "sms" else str(self.email)


class SignupOtpVerifyResponse(BaseModel):
    """Returned on successful signup-verify. The client passes
    `verification_token` to /auth/signup; the backend validates it pins
    the same contact + channel."""

    verification_token: str
    expires_in: int  # seconds
