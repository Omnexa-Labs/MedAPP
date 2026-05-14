from fastapi import APIRouter

router = APIRouter(tags=["Social"])


@router.get("/")
async def index() -> dict[str, str]:
    return {"service": "social_service", "status": "scaffold"}
