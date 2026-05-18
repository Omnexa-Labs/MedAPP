from fastapi import APIRouter

router = APIRouter(tags=["Hospital"])


@router.get("/")
async def index() -> dict[str, str]:
    return {"service": "hospital_service", "status": "ready"}
