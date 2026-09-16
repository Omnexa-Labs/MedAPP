from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class TwoFactorStatus(BaseModel):
    enabled: bool
    available: bool
    recovery_codes_remaining: int
    sign_out_delay_seconds: int


class PasswordProof(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)


class SetupResponse(BaseModel):
    setup_id: UUID
    secret: str
    provisioning_uri: str
    recovery_codes: list[str]
    expires_in: int


class ConfirmSetup(BaseModel):
    setup_id: UUID
    code: str = Field(pattern=r"^[0-9]{6}$")


class FactorProof(PasswordProof):
    code: str = Field(min_length=6, max_length=32)


class LoginChallenge(BaseModel):
    mfa_required: Literal[True] = True
    challenge_token: str
    expires_in: int


class CompleteChallenge(BaseModel):
    challenge_token: str = Field(min_length=20, max_length=128)
    code: str = Field(min_length=6, max_length=32)
