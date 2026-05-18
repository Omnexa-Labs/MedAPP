from pydantic import BaseModel


class ServiceStatus(BaseModel):
    service: str
    status: str