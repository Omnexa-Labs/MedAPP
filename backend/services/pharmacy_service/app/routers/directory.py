from types import SimpleNamespace
from uuid import UUID

from anyio import CapacityLimiter, to_thread
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response

from ..deps import CurrentPrincipal, DbSession
from ..schemas.directory import DirectoryAction, DirectoryEdit, DirectoryHistory, DirectoryView
from ..services import directory, photos
from ..services.profile_access import current_owner

router = APIRouter(
    prefix="/v1/pharmacy-workspaces/{pharmacy_id}/profile", tags=["pharmacy profile"]
)


async def owner_access(
    pharmacy_id: UUID, principal=CurrentPrincipal, db=DbSession, authorization: str = Header()
):
    return await current_owner(db, principal, pharmacy_id, authorization)


Owner = Depends(owner_access)
photo_workers = CapacityLimiter(2)


@router.post("/photo", response_model=DirectoryView)
async def upload_photo(
    pharmacy_id: UUID,
    request: Request,
    response: Response,
    if_match: str = Header(pattern=r"^[1-9][0-9]{0,9}$"),
    owner=Owner,
    db=DbSession,
):
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type not in photos.CONTENT_TYPES:
        raise HTTPException(415, "Choose a JPEG, PNG or WebP photo.")
    pharmacy = await directory.pharmacy_record(db, pharmacy_id, owner)
    directory.require_version(pharmacy, int(if_match))
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > photos.MAX_UPLOAD_BYTES:
            raise HTTPException(413, "Choose a photo smaller than 8 MB.")
        body.extend(chunk)
    content = await to_thread.run_sync(
        photos.normalize_photo,
        bytes(body),
        content_type,
        limiter=photo_workers,
    )
    result = await photos.save_photo(
        db,
        pharmacy_id,
        actor(owner, DirectoryAction(version=int(if_match))),
        content,
    )
    await db.commit()
    response.headers["Cache-Control"] = "private, no-store"
    return result


@router.get("/photos/{photo_id}")
async def preview_photo(pharmacy_id: UUID, photo_id: UUID, owner=Owner, db=DbSession):
    return await photos.read_photo(db, pharmacy_id, photo_id, owner_id=owner)


def actor(owner, payload):
    return SimpleNamespace(
        actor_id=owner,
        owner_user_id=owner,
        version=payload.version,
        **({"changes": payload.changes} if isinstance(payload, DirectoryEdit) else {}),
    )


@router.get("", response_model=DirectoryView)
async def read(pharmacy_id: UUID, response: Response, owner=Owner, db=DbSession):
    response.headers["Cache-Control"] = "private, no-store"
    return directory.view(await directory.pharmacy_record(db, pharmacy_id, owner))


@router.patch("", response_model=DirectoryView)
async def edit(
    pharmacy_id: UUID, payload: DirectoryEdit, response: Response, owner=Owner, db=DbSession
):
    result = await directory.save_draft(db, pharmacy_id, actor(owner, payload))
    await db.commit()
    response.headers["Cache-Control"] = "private, no-store"
    return result


@router.post("/publish", response_model=DirectoryView)
async def publish(
    pharmacy_id: UUID, payload: DirectoryAction, response: Response, owner=Owner, db=DbSession
):
    result = await directory.publish(db, pharmacy_id, actor(owner, payload))
    await db.commit()
    response.headers["Cache-Control"] = "private, no-store"
    return result


@router.post("/withdraw", response_model=DirectoryView)
async def withdraw(
    pharmacy_id: UUID, payload: DirectoryAction, response: Response, owner=Owner, db=DbSession
):
    result = await directory.withdraw(db, pharmacy_id, actor(owner, payload))
    await db.commit()
    response.headers["Cache-Control"] = "private, no-store"
    return result


@router.get("/history", response_model=DirectoryHistory)
async def history(
    pharmacy_id: UUID,
    response: Response,
    owner=Owner,
    db=DbSession,
    offset: int = Query(0, ge=0, le=100000),
):
    response.headers["Cache-Control"] = "private, no-store"
    return await directory.history(db, pharmacy_id, owner, offset)
