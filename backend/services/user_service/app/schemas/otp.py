import re

from pydantic import BaseModel, Field, field_validator

E164 = re.compile(r"^\+[1-9]\d{6,14}$")


class OtpStartRequest(BaseModel):
    phone: str = Field(max_length=32)
    purpose: str = "login"  # "login" | "signup" | "verify"

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
