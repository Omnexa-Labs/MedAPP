"""Resolve a display name from user_service.

Called at WRITE time only. See the note on `SocialPost.author_name` for why the
name is snapshotted rather than joined at read time.

The caller's own bearer token is forwarded: the lookup is performed ON BEHALF OF
the author, not with a service identity social_service does not have. That also
means a caller can never resolve a name they could not have resolved themselves.

FAILURE IS NON-FATAL. If user_service is unreachable, slow, or returns anything
unexpected, this returns None and the post is created with no snapshot. Losing a
display name is a degraded feed row; losing the post is losing what someone
wrote.
"""

from __future__ import annotations

import logging

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 3.0


async def resolve_display_name(user_id: str, authorization: str | None) -> str | None:
    if not authorization:
        return None
    url = f"{settings.user_service_url}/users/{user_id}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as http:
            response = await http.get(url, headers={"Authorization": authorization})
        if response.status_code != 200:
            logger.warning("display-name lookup returned %s", response.status_code)
            return None
        name = response.json().get("display_name")
        return name.strip() if isinstance(name, str) and name.strip() else None
    except Exception:  # noqa: BLE001 - see the docstring: never block a write
        logger.warning("display-name lookup failed", exc_info=True)
        return None
