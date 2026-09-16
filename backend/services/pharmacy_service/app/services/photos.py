"""Bounded photos, with publication checked on every content request.

Keeping at most the live and saved-draft image in PostgreSQL makes the image,
revision and cleanup one transaction. Original uploads/metadata are never stored.
"""

from io import BytesIO
from uuid import uuid4

from fastapi import HTTPException, Response
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import delete, select

from ..models import PharmacyPhoto, PharmacyProfile
from ..photo_paths import managed_photo_id, photo_path

MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_STORED_BYTES = 1024 * 1024
MAX_PIXELS = 20_000_000
CONTENT_TYPES = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}


def unavailable():
    return HTTPException(404, "Photo unavailable.", headers={"Cache-Control": "private, no-store"})


def normalize_photo(content: bytes, content_type: str) -> bytes:
    if not content or len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Choose a photo smaller than 8 MB.")
    if content_type not in CONTENT_TYPES:
        raise HTTPException(415, "Choose a JPEG, PNG or WebP photo.")
    try:
        with Image.open(BytesIO(content), formats=list(CONTENT_TYPES.values())) as source:
            if source.format != CONTENT_TYPES[content_type]:
                raise HTTPException(415, "The photo contents do not match its file type.")
            if source.width * source.height > MAX_PIXELS:
                raise HTTPException(422, "Choose a photo with at most 20 million pixels.")
            if getattr(source, "n_frames", 1) != 1:
                raise HTTPException(422, "Choose a still photo; animated images are not supported.")
            source.load()
            oriented = ImageOps.exif_transpose(source)
            oriented.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
            # Copy pixels onto a fresh canvas: no EXIF, GPS, comments or ICC data.
            pixels = oriented.convert("RGBA")
            clean = Image.new("RGB", pixels.size, "white")
            clean.paste(pixels, mask=pixels.getchannel("A"))
            for quality in (85, 75, 60):
                output = BytesIO()
                clean.save(output, format="JPEG", quality=quality, optimize=True)
                if output.tell() <= MAX_STORED_BYTES:
                    return output.getvalue()
            raise HTTPException(422, "This photo is too detailed. Choose a smaller image.")
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(
            422, "This photo could not be read. Choose a valid JPEG, PNG or WebP."
        ) from None


async def prune_photos(db, pharmacy):
    """Called while the versioned profile update still holds its transaction lock."""
    keep = {
        photo_id
        for value in (pharmacy.photo_url, (pharmacy.directory_draft or {}).get("photo_url"))
        if (photo_id := managed_photo_id(value, pharmacy.id))
    }
    statement = delete(PharmacyPhoto).where(PharmacyPhoto.pharmacy_id == pharmacy.id)
    if keep:
        statement = statement.where(PharmacyPhoto.id.not_in(keep))
    await db.execute(statement)


async def save_photo(db, pharmacy_id, actor, content):
    from . import directory

    pharmacy = await directory.pharmacy_record(db, pharmacy_id, actor.owner_user_id)
    directory.require_version(pharmacy, actor.version)
    before = pharmacy.directory_draft or directory.live_fields(pharmacy)
    photo_id = uuid4()
    after = {**before, "photo_url": photo_path(pharmacy_id, photo_id)}
    # Do not reject an otherwise valid photo because another legacy profile
    # field needs correction. Publication validates the complete saved draft.
    db.add(PharmacyPhoto(id=photo_id, pharmacy_id=pharmacy_id, content=content))
    await directory.commit_change(
        db,
        pharmacy,
        actor,
        actor.version,
        "photo.uploaded",
        {"directory_draft": after, "updated_at": PharmacyProfile.updated_at},
        before,
        after,
    )
    return directory.view(pharmacy)


async def read_photo(db, pharmacy_id, photo_id, *, owner_id=None):
    path = photo_path(pharmacy_id, photo_id)
    if owner_id is not None:
        from .directory import pharmacy_record

        pharmacy = await pharmacy_record(db, pharmacy_id, owner_id)
        if path not in {pharmacy.photo_url, (pharmacy.directory_draft or {}).get("photo_url")}:
            raise unavailable()
        statement = select(PharmacyPhoto.content).where(
            PharmacyPhoto.pharmacy_id == pharmacy_id,
            PharmacyPhoto.id == photo_id,
        )
    else:
        # One query evaluates both the current publication and its bytes.
        statement = (
            select(PharmacyPhoto.content)
            .join(PharmacyProfile, PharmacyProfile.id == PharmacyPhoto.pharmacy_id)
            .where(
                PharmacyPhoto.pharmacy_id == pharmacy_id,
                PharmacyPhoto.id == photo_id,
                PharmacyProfile.is_active.is_(True),
                PharmacyProfile.is_listable.is_(True),
                PharmacyProfile.photo_url == path,
            )
        )
    content = await db.scalar(statement)
    if content is None:
        raise unavailable()
    return Response(
        content,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": 'inline; filename="pharmacy.jpg"',
        },
    )
