import re
from uuid import UUID

UUID_PATTERN = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
PHOTO_PATH = re.compile(rf"/v1/pharmacies/({UUID_PATTERN})/photos/({UUID_PATTERN})")


def photo_path(pharmacy_id: UUID, photo_id: UUID) -> str:
    return f"/v1/pharmacies/{pharmacy_id}/photos/{photo_id}"


def managed_photo_id(value: str | None, pharmacy_id: UUID) -> UUID | None:
    match = PHOTO_PATH.fullmatch(value or "")
    if match and UUID(match[1]) == pharmacy_id:
        return UUID(match[2])
    return None
