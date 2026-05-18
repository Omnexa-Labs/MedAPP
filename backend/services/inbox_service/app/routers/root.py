from fastapi import APIRouter

router = APIRouter(tags=["Inbox"])


@router.get("/")
async def index() -> dict[str, str]:
    return {"service": "inbox_service", "status": "ready"}