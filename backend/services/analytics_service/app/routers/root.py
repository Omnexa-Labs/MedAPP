from fastapi import APIRouter

router = APIRouter(tags=["Analytics"])


@router.get("/")
async def index() -> dict[str, str]:
    return {"service": "analytics_service", "status": "scaffold"}
