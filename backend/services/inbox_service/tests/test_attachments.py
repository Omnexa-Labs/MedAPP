"""Attachment upload, authorisation, limits and round-trip.

Everything here goes over HTTP. Nothing reaches into the session to set a
column by hand — `docs/api/social_service.md` records a bug that survived
because a test performed a step no real caller could perform, and these tests
are written to be incapable of that.
"""

from __future__ import annotations

import pytest

from app.config import settings

# A tiny but real M4A-ish payload. The content matters less than the declared
# type — the service allowlists the DECLARED type and defends against a lie
# with response headers, not with sniffing (see app/config.py).
VOICE_NOTE_BYTES = b"\x00\x00\x00\x20ftypM4A " + b"\x11" * 512
VOICE_NOTE_TYPE = "audio/m4a"


async def _make_thread(client, principal, subject: str = "Attachment thread") -> str:
    response = await client.post(
        "/v1/threads",
        json={
            "subject": subject,
            "participant_user_ids": [principal.subject],
            "participant_roles": ["user"],
            "source": "direct",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["thread_id"]


async def _upload(client, thread_id, *, content=VOICE_NOTE_BYTES, filename="voice-note.m4a", content_type=VOICE_NOTE_TYPE, duration_ms=None):
    data = {}
    if duration_ms is not None:
        data["duration_ms"] = str(duration_ms)
    return await client.post(
        f"/v1/threads/{thread_id}/attachments",
        files={"file": (filename, content, content_type)},
        data=data,
    )


@pytest.mark.asyncio
async def test_participant_can_upload_an_attachment(client, principal_user):
    thread_id = await _make_thread(client, principal_user)

    response = await _upload(client, thread_id, duration_ms=7_400)

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["thread_id"] == thread_id
    # Staged: uploaded, not yet attached to any message.
    assert body["message_id"] is None
    assert body["uploader_user_id"] == principal_user.subject
    assert body["content_type"] == VOICE_NOTE_TYPE
    assert body["byte_size"] == len(VOICE_NOTE_BYTES)
    assert body["original_filename"] == "voice-note.m4a"
    assert body["duration_ms"] == 7_400
    # THE URL THAT MUST NOT EXIST. A link that grants access is a bearer
    # credential; see routers/attachments.py. If someone adds one, this fails.
    assert "url" not in body
    assert "storage_key" not in body


@pytest.mark.asyncio
async def test_non_participant_cannot_upload_or_read(client, outsider_client, principal_user):
    """The 403 path, on all three attachment routes."""
    thread_id = await _make_thread(client, principal_user)
    uploaded = await _upload(client, thread_id, duration_ms=1_000)
    attachment_id = uploaded.json()["attachment_id"]

    assert (await _upload(outsider_client, thread_id)).status_code == 403
    assert (await outsider_client.get(f"/v1/threads/{thread_id}/attachments")).status_code == 403
    fetched = await outsider_client.get(f"/v1/threads/{thread_id}/attachments/{attachment_id}/content")
    assert fetched.status_code == 403, fetched.text


@pytest.mark.asyncio
async def test_oversize_upload_is_rejected(client, principal_user, attachment_storage):
    thread_id = await _make_thread(client, principal_user)

    oversize = b"\x00" * (settings.max_attachment_bytes + 1)
    response = await _upload(client, thread_id, content=oversize, filename="huge.pdf", content_type="application/pdf")

    assert response.status_code == 413, response.text

    # And nothing was kept. A rejected upload that still costs disk is the
    # denial-of-service the cap exists to prevent.
    assert (await client.get(f"/v1/threads/{thread_id}/attachments")).json()["items"] == []
    written = [p for p in attachment_storage.rglob("*") if p.is_file()] if attachment_storage.exists() else []
    assert written == []


@pytest.mark.asyncio
async def test_disallowed_content_type_is_rejected(client, principal_user):
    thread_id = await _make_thread(client, principal_user)

    response = await _upload(
        client, thread_id, content=b"MZ\x90\x00", filename="totally-safe.exe", content_type="application/x-msdownload"
    )

    # 415, not 400 — the request is fine, the media type is not.
    assert response.status_code == 415, response.text
    assert "not accepted" in response.json()["detail"]


@pytest.mark.asyncio
async def test_empty_upload_is_rejected(client, principal_user):
    thread_id = await _make_thread(client, principal_user)
    response = await _upload(client, thread_id, content=b"")
    assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_body_only_message_still_sends_unchanged(client, principal_user):
    """THE REGRESSION GUARD. `{ "body": ... }` must behave exactly as before."""
    thread_id = await _make_thread(client, principal_user)

    response = await client.post(f"/v1/threads/{thread_id}/messages", json={"body": "Just text, no attachment."})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["body"] == "Just text, no attachment."
    # Additive field, empty. An existing client ignoring the key is unaffected.
    assert body["attachments"] == []

    listed = await client.get(f"/v1/threads/{thread_id}/messages")
    assert listed.status_code == 200
    assert listed.json()[0]["attachments"] == []


@pytest.mark.asyncio
async def test_empty_body_without_attachment_is_still_rejected(client, principal_user):
    """Relaxing `body` to allow voice-note-only sends must not widen this."""
    thread_id = await _make_thread(client, principal_user)
    assert (await client.post(f"/v1/threads/{thread_id}/messages", json={"body": ""})).status_code == 422
    assert (await client.post(f"/v1/threads/{thread_id}/messages", json={})).status_code == 422


@pytest.mark.asyncio
async def test_attachment_round_trip_and_duration_survives(client, principal_user):
    """upload -> attach to a message -> list -> fetch the bytes back."""
    thread_id = await _make_thread(client, principal_user)

    uploaded = await _upload(client, thread_id, duration_ms=7_400)
    assert uploaded.status_code == 201, uploaded.text
    attachment_id = uploaded.json()["attachment_id"]

    # A voice note with NO typed body — the normal way one is sent.
    sent = await client.post(
        f"/v1/threads/{thread_id}/messages",
        json={"body": "", "attachment_ids": [attachment_id]},
    )
    assert sent.status_code == 200, sent.text
    message = sent.json()
    assert len(message["attachments"]) == 1
    attached = message["attachments"][0]
    assert attached["attachment_id"] == attachment_id
    assert attached["message_id"] == message["message_id"]
    # duration_ms survives the staging -> attach -> response trip. Without it
    # the client cannot draw a player without downloading the file.
    assert attached["duration_ms"] == 7_400
    assert attached["content_type"] == VOICE_NOTE_TYPE

    # It comes back on the message LIST too, not only on the send response.
    listed = await client.get(f"/v1/threads/{thread_id}/messages")
    assert listed.status_code == 200, listed.text
    assert listed.json()[0]["attachments"][0]["duration_ms"] == 7_400

    # And on the thread's attachment index.
    index = await client.get(f"/v1/threads/{thread_id}/attachments")
    assert index.status_code == 200, index.text
    assert [item["attachment_id"] for item in index.json()["items"]] == [attachment_id]

    # The bytes themselves, byte-for-byte.
    content = await client.get(f"/v1/threads/{thread_id}/attachments/{attachment_id}/content")
    assert content.status_code == 200, content.text
    assert content.content == VOICE_NOTE_BYTES
    assert content.headers["content-type"].startswith(VOICE_NOTE_TYPE)
    # PHI response posture — see routers/attachments.py.
    assert content.headers["x-content-type-options"] == "nosniff"
    assert content.headers["cache-control"] == "no-store"
    assert content.headers["content-disposition"].startswith("attachment;")


@pytest.mark.asyncio
async def test_attachment_from_another_thread_cannot_be_attached(client, principal_user):
    """An id is not a capability, even for a thread you ARE in."""
    thread_a = await _make_thread(client, principal_user, "Thread A")
    thread_b = await _make_thread(client, principal_user, "Thread B")

    uploaded = await _upload(client, thread_a)
    attachment_id = uploaded.json()["attachment_id"]

    response = await client.post(
        f"/v1/threads/{thread_b}/messages",
        json={"body": "borrowed", "attachment_ids": [attachment_id]},
    )
    assert response.status_code == 404, response.text

    # Nor can it be fetched through thread B's path.
    fetched = await client.get(f"/v1/threads/{thread_b}/attachments/{attachment_id}/content")
    assert fetched.status_code == 404, fetched.text


@pytest.mark.asyncio
async def test_attachment_cannot_be_attached_twice(client, principal_user):
    thread_id = await _make_thread(client, principal_user)
    attachment_id = (await _upload(client, thread_id)).json()["attachment_id"]

    first = await client.post(
        f"/v1/threads/{thread_id}/messages", json={"body": "one", "attachment_ids": [attachment_id]}
    )
    assert first.status_code == 200, first.text

    second = await client.post(
        f"/v1/threads/{thread_id}/messages", json={"body": "two", "attachment_ids": [attachment_id]}
    )
    assert second.status_code == 409, second.text


@pytest.mark.asyncio
async def test_out_of_range_duration_is_rejected(client, principal_user):
    thread_id = await _make_thread(client, principal_user)
    response = await _upload(client, thread_id, duration_ms=settings.max_attachment_duration_ms + 1)
    assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_filename_cannot_carry_a_path(client, principal_user, attachment_storage):
    """Traversal is unreachable by construction; prove the name never becomes a path."""
    thread_id = await _make_thread(client, principal_user)

    response = await _upload(client, thread_id, filename="../../../../etc/passwd", content_type="application/pdf")

    assert response.status_code == 201, response.text
    assert response.json()["original_filename"] == "passwd"
    stored = [p for p in attachment_storage.rglob("*") if p.is_file()]
    assert len(stored) == 1
    assert stored[0].name.endswith(".bin")
    assert "passwd" not in str(stored[0])
