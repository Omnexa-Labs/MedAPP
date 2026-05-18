from fastapi import APIRouter

router = APIRouter(tags=["Lab"])


@router.get("/")
async def index() -> dict[str, str]:
    return {"service": "lab_service", "status": "ready"}
