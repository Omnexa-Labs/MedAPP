"""Thin async wrapper around `qdrant-client`.

Two reasons this exists rather than using `AsyncQdrantClient` directly:

1. We swap it for an in-memory fake in unit tests. The protocol below is the
   minimal surface our memory layer uses.
2. We centralise collection bootstrap and the filter shape (always
   payload-filter by `patient_id`) so callers can't forget.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Protocol

logger = logging.getLogger(__name__)


@dataclass
class QdrantPoint:
    id: str
    vector: list[float]
    payload: dict[str, Any]


@dataclass
class QdrantHit:
    id: str
    score: float
    payload: dict[str, Any]


class QdrantClientLike(Protocol):
    """The minimum interface `memory.py` needs.

    Real impl is `AsyncQdrantWrapper`; tests use `InMemoryQdrant`.
    """

    async def ensure_collection(self, name: str, *, vector_size: int) -> None: ...

    async def upsert(self, collection: str, points: list[QdrantPoint]) -> None: ...

    async def search(
        self,
        collection: str,
        *,
        vector: list[float],
        patient_id: str,
        limit: int = 4,
        extra_filter: dict[str, Any] | None = None,
    ) -> list[QdrantHit]: ...


class AsyncQdrantWrapper:
    """Production impl. Lazy-imports `qdrant_client` so tests can run without it."""

    def __init__(self, url: str, *, api_key: str | None = None) -> None:
        try:
            from qdrant_client import AsyncQdrantClient
        except ImportError as e:
            raise ImportError("qdrant-client is required") from e
        self._c = AsyncQdrantClient(url=url, api_key=api_key)

    async def ensure_collection(self, name: str, *, vector_size: int) -> None:
        from qdrant_client.http import models as qm
        existing = await self._c.get_collections()
        if any(c.name == name for c in existing.collections):
            return
        await self._c.create_collection(
            collection_name=name,
            vectors_config=qm.VectorParams(size=vector_size, distance=qm.Distance.COSINE),
        )
        # patient_id is the universal hot filter; index it.
        await self._c.create_payload_index(
            collection_name=name,
            field_name="patient_id",
            field_schema="keyword",
        )

    async def upsert(self, collection: str, points: list[QdrantPoint]) -> None:
        from qdrant_client.http import models as qm
        await self._c.upsert(
            collection_name=collection,
            points=[
                qm.PointStruct(id=p.id, vector=p.vector, payload=p.payload)
                for p in points
            ],
        )

    async def search(
        self,
        collection: str,
        *,
        vector: list[float],
        patient_id: str,
        limit: int = 4,
        extra_filter: dict[str, Any] | None = None,
    ) -> list[QdrantHit]:
        from qdrant_client.http import models as qm
        conditions = [
            qm.FieldCondition(key="patient_id", match=qm.MatchValue(value=patient_id))
        ]
        if extra_filter:
            for k, v in extra_filter.items():
                conditions.append(
                    qm.FieldCondition(key=k, match=qm.MatchValue(value=v))
                )
        result = await self._c.search(
            collection_name=collection,
            query_vector=vector,
            query_filter=qm.Filter(must=conditions),
            limit=limit,
        )
        return [
            QdrantHit(id=str(r.id), score=r.score, payload=dict(r.payload or {}))
            for r in result
        ]


class InMemoryQdrant:
    """Test double. Behaves like a Qdrant of one node, single thread.

    Implements just enough to satisfy `QdrantClientLike` and exercise the
    memory layer end-to-end without a running Qdrant.
    """

    def __init__(self) -> None:
        self._collections: dict[str, list[QdrantPoint]] = {}
        self._dims: dict[str, int] = {}

    async def ensure_collection(self, name: str, *, vector_size: int) -> None:
        self._collections.setdefault(name, [])
        self._dims[name] = vector_size

    async def upsert(self, collection: str, points: list[QdrantPoint]) -> None:
        if collection not in self._collections:
            raise KeyError(f"collection {collection!r} not created")
        bucket = self._collections[collection]
        existing_ids = {p.id for p in points}
        # upsert: drop any existing point with the same id, then append.
        self._collections[collection] = [p for p in bucket if p.id not in existing_ids] + list(points)

    async def search(
        self,
        collection: str,
        *,
        vector: list[float],
        patient_id: str,
        limit: int = 4,
        extra_filter: dict[str, Any] | None = None,
    ) -> list[QdrantHit]:
        if collection not in self._collections:
            return []
        candidates = [
            p for p in self._collections[collection]
            if p.payload.get("patient_id") == patient_id
            and all(p.payload.get(k) == v for k, v in (extra_filter or {}).items())
        ]
        scored = [(_cosine(vector, p.vector), p) for p in candidates]
        scored.sort(key=lambda x: x[0], reverse=True)
        return [
            QdrantHit(id=p.id, score=s, payload=dict(p.payload))
            for s, p in scored[:limit]
        ]


def _cosine(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or not a:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(x * x for x in b) ** 0.5
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)
