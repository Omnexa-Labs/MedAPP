from fastapi import APIRouter

router = APIRouter(tags=["Telemedicine"])


@router.get("/")
async def index() -> dict[str, str]:
    return {"service": "telemedicine_service", "status": "scaffold"}
