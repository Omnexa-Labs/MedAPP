"""Private application files; API authorization precedes every object read."""

from __future__ import annotations

import asyncio
from functools import lru_cache
from typing import Protocol

from .config import settings


class DocumentStorage(Protocol):
    async def write(self, key: str, data: bytes, content_type: str) -> str: ...
    async def read(self, key: str, generation: str, maximum: int) -> bytes: ...


class GcsDocumentStorage:
    def __init__(self, bucket_name: str, client=None):
        # Creating the dependency does not contact storage or discover credentials.
        # Authorization and validation happen before write/read invoke this adapter.
        self.bucket_name = bucket_name
        self.client = client

    def _bucket(self):
        if not self.bucket_name:
            raise RuntimeError("application document storage is not configured")
        if self.client is None:
            from google.cloud import storage

            self.client = storage.Client()
        return self.client.bucket(self.bucket_name)

    async def write(self, key: str, data: bytes, content_type: str) -> str:
        def upload():
            blob = self._bucket().blob(key)
            blob.cache_control = "private, no-store"
            blob.upload_from_string(
                data,
                content_type=content_type,
                if_generation_match=0,
                checksum="crc32c",
                timeout=30,
                retry=None,
            )
            if blob.generation is None:
                raise RuntimeError("storage did not return an object generation")
            return str(blob.generation)

        return await asyncio.to_thread(upload)

    async def read(self, key: str, generation: str, maximum: int) -> bytes:
        def download():
            blob = self._bucket().blob(key, generation=int(generation))
            # A range also bounds memory if object metadata has been corrupted.
            return blob.download_as_bytes(
                if_generation_match=int(generation),
                end=maximum,
                timeout=30,
                checksum="crc32c",
                retry=None,
            )

        return await asyncio.to_thread(download)


@lru_cache(maxsize=1)
def get_storage() -> DocumentStorage:
    return GcsDocumentStorage(settings.gcs_bucket)
