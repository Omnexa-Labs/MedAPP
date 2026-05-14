from fastapi import APIRouter

router = APIRouter(tags=["EHR"])


@router.get("/")
async def index() -> dict[str, str]:
    return {"service": "ehr_service", "status": "scaffold"}
