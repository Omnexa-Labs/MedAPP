from fastapi import APIRouter

from ..schemas.status import ServiceStatus
from ..services.root_service import get_service_status

router = APIRouter(tags=["Pharmacy"])


@router.get("/", response_model=ServiceStatus)
async def index() -> ServiceStatus:
    return get_service_status()
