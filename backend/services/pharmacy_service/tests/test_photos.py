from io import BytesIO
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from app.models import PharmacyPhoto
from app.services import directory, photos, profile_access
from fastapi import HTTPException
from PIL import Image
from sqlalchemy import func, select

from tests.test_directory import COMPLETE, command  # noqa: F401
from tests.test_directory import workspace as photo_workspace
from tests.test_owner_workspaces import owner

workspace = photo_workspace


def image_bytes(fmt="PNG", size=(32, 24), **options):
    image = Image.new("RGB", size, "teal")
    output = BytesIO()
    image.save(output, format=fmt, **options)
    return output.getvalue()


@pytest.mark.parametrize("mime,fmt", list(photos.CONTENT_TYPES.items()))
def test_normalizes_supported_photos_with_bounded_size_and_no_metadata(mime, fmt):
    content = photos.normalize_photo(image_bytes(fmt, (2000, 1000)), mime)
    with Image.open(BytesIO(content)) as image:
        assert image.format == "JPEG" and image.size == (1600, 800)
        assert not image.getexif() and "icc_profile" not in image.info
    assert len(content) <= photos.MAX_STORED_BYTES


def test_exif_orientation_is_applied_and_metadata_removed():
    exif = Image.Exif()
    exif[274], exif[315] = 6, "Private author"
    content = photos.normalize_photo(image_bytes("JPEG", exif=exif), "image/jpeg")
    with Image.open(BytesIO(content)) as image:
        assert image.size == (24, 32) and not image.getexif()
    assert b"Private author" not in content


@pytest.mark.parametrize(
    "content,mime,status",
    [
        (b"<svg><script/></svg>", "image/svg+xml", 415),
        (b"<html>fake</html>", "image/png", 422),
        (image_bytes(), "image/jpeg", 415),
        (image_bytes()[:40], "image/png", 422),
        (b"", "image/png", 413),
        (b"x" * (photos.MAX_UPLOAD_BYTES + 1), "image/jpeg", 413),
    ],
)
def test_rejects_bad_photo_inputs(content, mime, status):
    with pytest.raises(HTTPException) as error:
        photos.normalize_photo(content, mime)
    assert error.value.status_code == status


def test_rejects_animated_and_excessive_pixels(monkeypatch):
    output = BytesIO()
    Image.new("RGB", (4, 4), "red").save(
        output,
        format="PNG",
        save_all=True,
        append_images=[Image.new("RGB", (4, 4), "blue")],
        duration=100,
    )
    with pytest.raises(HTTPException, match="still photo"):
        photos.normalize_photo(output.getvalue(), "image/png")
    monkeypatch.setattr(photos, "MAX_PIXELS", 100)
    with pytest.raises(HTTPException, match="million pixels"):
        photos.normalize_photo(image_bytes(), "image/png")


async def upload(client, path, version=1, content=None):
    return await client.post(
        path + "/photo",
        content=content or image_bytes(),
        headers={"Content-Type": "image/png", "If-Match": str(version)},
    )


async def count_photos(factory):
    async with factory() as db:
        return await db.scalar(select(func.count()).select_from(PharmacyPhoto))


async def test_photo_publication_replacement_removal_and_cleanup(
    client, workspace, session_factory
):
    pharmacy_id, path = workspace
    assert (await client.patch(path, json={"version": 1, "changes": COMPLETE})).status_code == 200
    first = await upload(client, path, 2)
    assert first.status_code == 200, first.text
    first_path = first.json()["draft"]["photo_url"]
    first_preview = path + "/photos/" + first_path.rsplit("/", 1)[-1]
    assert (await client.get(first_path)).status_code == 404
    private = await client.get(first_preview)
    assert private.status_code == 200 and private.headers["content-type"] == "image/jpeg"
    assert private.headers["cache-control"] == "private, no-store"
    assert (await client.post(path + "/publish", json={"version": 3})).status_code == 200
    public = await client.get(first_path)
    assert (
        public.content == private.content and public.headers["x-content-type-options"] == "nosniff"
    )
    detail = (await client.get(f"/v1/pharmacies/{pharmacy_id}")).json()
    assert detail["photo_url"] == "http://localhost:8000" + first_path
    second = await upload(client, path, 4)
    second_path = second.json()["draft"]["photo_url"]
    assert second.json()["published"]["photo_url"] == first_path
    assert await count_photos(session_factory) == 2
    assert (await client.get(second_path)).status_code == 404
    assert (await client.get(first_path)).status_code == 200
    assert (await client.post(path + "/publish", json={"version": 5})).status_code == 200
    assert await count_photos(session_factory) == 1
    assert (await client.get(first_path)).status_code == 404
    assert (await client.get(first_preview)).status_code == 404
    assert (await client.get(second_path)).status_code == 200
    assert (await client.post(path + "/withdraw", json={"version": 6})).status_code == 200
    assert (await client.get(second_path)).status_code == 404
    assert (await client.post(path + "/publish", json={"version": 7})).status_code == 200
    assert (
        await client.patch(path, json={"version": 8, "changes": {"photo_url": None}})
    ).status_code == 200
    assert (await client.get(second_path)).status_code == 200
    assert (await client.post(path + "/publish", json={"version": 9})).status_code == 200
    assert (await client.get(second_path)).status_code == 404
    assert await count_photos(session_factory) == 0
    events = (await client.get(path + "/history")).json()["items"]
    assert sum(event["action"] == "photo.uploaded" for event in events) == 2


async def test_stale_upload_and_managed_reference_assignment_do_not_create_orphans(
    client, workspace, session_factory
):
    _, path = workspace
    first = (await upload(client, path)).json()
    assert (await upload(client, path)).status_code == 409
    assert (
        await client.patch(
            path, json={"version": 2, "changes": {"photo_url": first["draft"]["photo_url"]}}
        )
    ).status_code == 422
    second = await upload(client, path, 2)
    assert second.status_code == 200
    assert await count_photos(session_factory) == 1
    assert (
        await client.get(path + "/photos/" + first["draft"]["photo_url"].rsplit("/", 1)[-1])
    ).status_code == 404


async def test_upload_transaction_failure_rolls_back_photo_and_revision(
    client, workspace, session_factory, monkeypatch
):
    _, path = workspace
    original = directory.commit_change

    async def fail(*args, **kwargs):
        await original(*args, **kwargs)
        raise HTTPException(503, "Save unavailable")

    monkeypatch.setattr(directory, "commit_change", fail)
    assert (await upload(client, path)).status_code == 503
    assert await count_photos(session_factory) == 0
    assert (await client.get(path)).json()["version"] == 1


async def test_photo_access_checks_owner_membership_and_pharmacy(client, workspace, monkeypatch):
    pharmacy_id, path = workspace
    first = (await upload(client, path)).json()["draft"]["photo_url"]
    preview = path + "/photos/" + first.rsplit("/", 1)[-1]
    owner(uuid4())
    assert (await client.get(preview)).status_code == 404
    assert (await upload(client, path, 2)).status_code == 404
    owner()
    assert (await client.get(first.replace(str(pharmacy_id), str(uuid4())))).status_code == 404
    monkeypatch.setattr(
        profile_access, "check_pms_access", AsyncMock(side_effect=HTTPException(403, "Revoked"))
    )
    assert (await client.get(preview)).status_code == 403
    assert (await upload(client, path, 2)).status_code == 403


@pytest.mark.parametrize("version", [None, "0", "-1", "1.5", '"1"', "99999999999"])
async def test_upload_requires_explicit_version(client, workspace, version):
    _, path = workspace
    headers = {"Content-Type": "image/png"}
    if version is not None:
        headers["If-Match"] = version
    assert (
        await client.post(path + "/photo", content=image_bytes(), headers=headers)
    ).status_code == 422


async def test_stream_limit_and_invalid_bytes_preserve_draft(client, workspace):
    _, path = workspace
    for data, status in [(b"not a photo", 422), (b"x" * (photos.MAX_UPLOAD_BYTES + 1), 413)]:
        response = await upload(client, path, content=data)
        assert response.status_code == status
        assert (await client.get(path)).json()["version"] == 1
