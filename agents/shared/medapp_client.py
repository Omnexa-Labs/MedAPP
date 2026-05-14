"""HTTP client for calling MedApp backend services from inside agent tools.

Tools accept a `patient_id` and forward it as `X-Patient-Id` so downstream
services can apply the correct row-level access policy. The agent's own service
account JWT goes in the Authorization header.
"""
from __future__ import annotations

import httpx


class MedAppClient:
    def __init__(self, base_url: str, *, service_token: str, timeout: float = 10.0) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url,
            timeout=timeout,
            headers={"Authorization": f"Bearer {service_token}"},
        )

    async def get(self, path: str, *, patient_id: str | None = None, **kwargs) -> httpx.Response:
        headers = kwargs.pop("headers", {})
        if patient_id:
            headers["X-Patient-Id"] = patient_id
        return await self._client.get(path, headers=headers, **kwargs)

    async def post(self, path: str, *, patient_id: str | None = None, **kwargs) -> httpx.Response:
        headers = kwargs.pop("headers", {})
        if patient_id:
            headers["X-Patient-Id"] = patient_id
        return await self._client.post(path, headers=headers, **kwargs)

    async def aclose(self) -> None:
        await self._client.aclose()
