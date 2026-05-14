from fastapi import APIRouter

router = APIRouter(tags=["Payment"])


@router.get("/")
async def index() -> dict[str, str]:
    return {"service": "payment_service", "status": "scaffold"}
