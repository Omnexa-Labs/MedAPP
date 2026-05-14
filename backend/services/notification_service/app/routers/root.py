from fastapi import APIRouter

router = APIRouter(tags=["Notification"])


@router.get("/")
async def index() -> dict[str, str]:
    return {"service": "notification_service", "status": "scaffold"}
