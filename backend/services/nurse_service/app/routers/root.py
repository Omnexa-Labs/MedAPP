from fastapi import APIRouter

router = APIRouter(tags=["Nurse"])


@router.get("/")
async def index() -> dict[str, str]:
    return {"service": "nurse_service", "status": "ready"}
