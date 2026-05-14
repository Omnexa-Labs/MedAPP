from fastapi import APIRouter

router = APIRouter(tags=["Booking"])


@router.get("/")
async def index() -> dict[str, str]:
    return {"service": "booking_service", "status": "scaffold"}
