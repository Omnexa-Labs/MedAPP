from typing import Literal

from pydantic import BaseModel, Field

Provider = Literal["google", "apple"]


class BeginProvider(BaseModel):
    provider: Provider
    model_config = {"extra": "forbid"}


class CompleteProvider(BaseModel):
    challenge_token: str = Field(min_length=32, max_length=128)
    identity_token: str = Field(min_length=1, max_length=16384)
    model_config = {"extra": "forbid"}


class LinkProvider(BaseModel):
    ticket: str = Field(min_length=32, max_length=128)
    current_password: str = Field(min_length=1, max_length=128)
    code: str = Field(default="", max_length=32)
    model_config = {"extra": "forbid"}


class RemoveProvider(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    code: str = Field(default="", max_length=32)
    model_config = {"extra": "forbid"}
