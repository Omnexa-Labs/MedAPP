from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class StartHandoff(BaseModel):
    model_config = ConfigDict(extra="forbid")
    application_id: UUID | None = None
    return_uri: str = Field(min_length=1, max_length=512)
    return_state: str = Field(pattern=r"^[a-zA-Z0-9_-]{32,64}$")


class HandoffProof(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(pattern=r"^[a-zA-Z0-9_-]{32,128}$")


class StartHospitalHandoff(BaseModel):
    model_config = ConfigDict(extra="forbid")
    return_uri: str = Field(min_length=1, max_length=512)
    return_state: str = Field(pattern=r"^[a-zA-Z0-9_-]{32,64}$")


class StartPharmacyHandoff(StartHospitalHandoff):
    pharmacy_id: UUID
