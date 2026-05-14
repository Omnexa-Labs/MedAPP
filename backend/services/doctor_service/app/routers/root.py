from fastapi import APIRouter

router = APIRouter(tags=["Doctor"])


@router.get("/")
async def index() -> dict[str, str]:
    return {"service": "doctor_service", "status": "scaffold"}
