"""Attachment bytes: where they live, and the seam that lets that change.

STORAGE CHOICE — local filesystem, on purpose, with the exit already cut
-----------------------------------------------------------------------
Attachment bytes are written to a directory on a Docker named volume
(`INBOX_ATTACHMENT_ROOT`, default `/app/var/attachments`). **No cloud
dependency was added.** This repo has no `boto3`, no `azure-storage`, no GCS
client anywhere in `backend/`, and no configured bucket, credential or
lifecycle policy. Adding one to ship a voice note would mean inventing an
account, a region and a key-rotation story that nobody has agreed to — and
would still need this same interface in front of it.

So the object-storage decision is DEFERRED, not skipped, and the seam is here:
everything above this module talks to `AttachmentStorage` (four methods,
`write` / `stream` / `delete` / `exists`) and never sees a filesystem path. The
service layer holds an opaque `storage_key` string. Swapping to S3 is one new
class in this file plus one line in `get_storage()`; no router, service, model
or migration changes.

THE LIMITS OF THIS CHOICE — read before deploying more than one replica
----------------------------------------------------------------------
1. **Not shared between replicas.** A file written by pod A is invisible to
   pod B. `inbox_service` therefore CANNOT be scaled horizontally while this
   backend is in use unless the volume is RWX (NFS/EFS). This is the binding
   constraint and the reason the swap will eventually be necessary.
2. **Not backed up by the database backup.** `pg_dump` captures the rows and
   none of the bytes. A restore produces attachment rows pointing at files that
   do not exist. The volume needs its own backup, or the restore needs to
   tolerate missing content (the fetch route answers 404, not 500 — see
   `attachment_service.open_attachment`).
3. **No server-side encryption at rest** beyond whatever the host volume
   provides. On the dev stack that is nothing. S3 SSE-KMS is the reason to
   move for a production PHI deployment, not the ergonomics.
4. **No lifecycle / retention automation.** Nothing deletes anything. Storage
   grows monotonically; the size cap in `config.py` is the only bound.

WHAT THIS MODULE DOES DEFEND
----------------------------
* **The key is generated here, never taken from the client.** It is
  `<thread_id>/<uuid4 hex>.bin` — no part of the uploader's filename reaches
  the filesystem, so `../../etc/passwd` and `voice note.m4a.php` are both
  simply impossible rather than filtered. The original name is a database
  column, returned in JSON, and never a path.
* **A resolve-time containment check anyway.** `_resolve` re-checks that the
  final path is inside the root. The key is ours, so this can only fire on a
  bug — which is exactly when you want it to.
* **0700 directories, 0600 files.** These are PHI. The container runs as UID
  10001 (`backend/Dockerfile`); nothing else on the volume can read them, and
  in particular **no static-file route serves this directory** — bytes leave
  only through the authorised handler in `routers/attachments.py`.
* **Blocking IO stays off the event loop.** `anyio.to_thread` wraps every
  read and write. Starlette already depends on anyio; no new package.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterable, AsyncIterator
from pathlib import Path
from typing import Protocol
from uuid import UUID, uuid4

import anyio

# 64 KiB: one filesystem read per chunk, and the unit in which bytes are held
# in memory while streaming. With the 8 MiB cap a download never buffers the
# whole file.
CHUNK_BYTES = 64 * 1024

_DIR_MODE = 0o700
_FILE_MODE = 0o600


class AttachmentStorage(Protocol):
    """The whole surface a storage backend has to implement.

    Deliberately four methods and no `url()`. A backend that could hand out a
    URL would invite the caller to hand that URL to a client, and a URL that
    grants access is a bearer credential — see the PHI note in
    `routers/attachments.py` for why this service refuses to mint one.
    """

    def build_key(self, thread_id: UUID) -> str: ...

    async def write(self, key: str, chunks: AsyncIterable[bytes]) -> int: ...

    def stream(self, key: str) -> AsyncIterator[bytes]: ...

    async def exists(self, key: str) -> bool: ...

    async def delete(self, key: str) -> None: ...


class LocalFilesystemAttachmentStorage:
    """`AttachmentStorage` over a directory tree. See the module docstring."""

    def __init__(self, root: str | Path) -> None:
        self._root = Path(root).resolve()

    @property
    def root(self) -> Path:
        return self._root

    def build_key(self, thread_id: UUID) -> str:
        """`<thread_id>/<random>.bin`.

        Sharded by thread so a directory listing never grows to the size of the
        whole service, and so "delete this thread's files" is a subtree
        removal. The `.bin` extension is fixed: the real content type lives in
        the database, and giving the file on disk an extension derived from
        user input is how a webshell gets executed by something else that
        happens to read the volume later.
        """
        return f"{thread_id}/{uuid4().hex}.bin"

    def _resolve(self, key: str) -> Path:
        candidate = (self._root / key).resolve()
        if candidate != self._root and self._root not in candidate.parents:
            raise ValueError("storage key escapes the attachment root")
        return candidate

    async def write(self, key: str, chunks: AsyncIterable[bytes]) -> int:
        """Consume an ASYNC chunk stream. Returns bytes written.

        Async rather than a plain iterable so the caller can enforce its size
        cap while reading the upload, and the whole file never has to sit in
        memory at once — the 8 MiB cap bounds the file, not the process.
        """
        path = self._resolve(key)

        def _open():
            path.parent.mkdir(parents=True, exist_ok=True, mode=_DIR_MODE)
            # os.open with 0600 rather than open()+chmod: the file is never
            # world-readable, not even for the instant between the two calls.
            # O_EXCL so a key collision fails loudly instead of overwriting
            # somebody else's attachment.
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, _FILE_MODE)
            return os.fdopen(fd, "wb")

        handle = await anyio.to_thread.run_sync(_open)
        written = 0
        try:
            async for chunk in chunks:
                if not chunk:
                    continue
                await anyio.to_thread.run_sync(handle.write, chunk)
                written += len(chunk)
        finally:
            await anyio.to_thread.run_sync(handle.close)
        return written

    async def stream(self, key: str) -> AsyncIterator[bytes]:
        path = self._resolve(key)
        handle = await anyio.to_thread.run_sync(lambda: open(path, "rb"))  # noqa: SIM115
        try:
            while True:
                chunk = await anyio.to_thread.run_sync(handle.read, CHUNK_BYTES)
                if not chunk:
                    return
                yield chunk
        finally:
            await anyio.to_thread.run_sync(handle.close)

    async def exists(self, key: str) -> bool:
        try:
            path = self._resolve(key)
        except ValueError:
            return False
        return await anyio.to_thread.run_sync(path.is_file)

    async def delete(self, key: str) -> None:
        """Best-effort. A missing file is success, not an error.

        `upload_attachment` calls this to clean up bytes whose database row
        failed to commit; raising there would replace a recoverable orphan file
        with a 500 the caller cannot act on.
        """
        try:
            path = self._resolve(key)
        except ValueError:
            return
        await anyio.to_thread.run_sync(lambda: path.unlink(missing_ok=True))


_storage: AttachmentStorage | None = None


def get_storage() -> AttachmentStorage:
    """The one place that names a concrete backend.

    Swapping to object storage is this function plus a sibling class. Cached in
    a module global rather than a FastAPI dependency because the backend is
    process-wide configuration, and the tests override
    `attachment_service.STORAGE` directly (see `tests/conftest.py`).
    """
    global _storage
    if _storage is None:
        from .config import settings

        _storage = LocalFilesystemAttachmentStorage(settings.attachment_root)
    return _storage


def set_storage(storage: AttachmentStorage | None) -> None:
    """Test seam. Pass `None` to fall back to the configured backend."""
    global _storage
    _storage = storage
