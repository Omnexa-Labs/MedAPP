"""Embedding provider abstraction.

Mirrors `agents/shared/llm.py`: a small protocol, vendor-agnostic, a
deterministic `MockEmbedding` default so dev and CI work with no network and
no key.

Real providers (OpenAI, local bge-small via sentence-transformers, Cohere on
Vertex) are loaded lazily by `make_embedder()` so we don't pull heavy SDKs
into the import graph unless that provider is selected.

PHI policy (see ADR 0003): sending PHI to an external embedding API requires
`ALLOW_EXTERNAL_PHI_EMBEDDING=true`. Enforcement lives at the call site in
`memory.py`, not here — this module is just transport.
"""
from __future__ import annotations

import hashlib
import math
from typing import Protocol


class EmbeddingProvider(Protocol):
    """Encode strings into dense vectors of fixed dimensionality."""

    dim: int

    def embed(self, texts: list[str]) -> list[list[float]]: ...


class MockEmbedding:
    """Deterministic stand-in. Same input → same vector, always.

    Hash-based. Not semantically meaningful — two paraphrases of the same
    sentence will produce unrelated vectors. That's fine for unit tests
    because we test *the wiring*, not retrieval quality. For an integration
    test you want real retrieval quality, use a real provider.

    Vector dim matches bge-small (384) so collections survive a provider
    swap without re-creating.
    """

    dim: int = 384

    def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for text in texts:
            digest = hashlib.sha512(text.encode("utf-8")).digest()
            # Repeat the 64-byte digest until we have `dim` floats.
            raw = (digest * ((self.dim // len(digest)) + 1))[: self.dim]
            vec = [(b / 255.0) * 2.0 - 1.0 for b in raw]
            out.append(_l2_normalize(vec))
        return out


def _l2_normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(x * x for x in vec))
    if norm == 0.0:
        return vec
    return [x / norm for x in vec]


def make_embedder(name: str) -> EmbeddingProvider:
    """Factory. Add new providers here as you implement them.

    The default is `mock`. The `local` provider uses `sentence-transformers`
    with `bge-small-en-v1.5` — install via `agents[local-embed]`.

    PHI must not be sent to a non-BAA external embedding provider. That guard
    lives in `memory.py`; here we only construct the transport.
    """
    name = name.lower()
    if name == "mock":
        return MockEmbedding()
    if name == "local":
        from .embeddings_local import LocalEmbedding  # lazy
        return LocalEmbedding()
    if name == "openai":
        from .embeddings_openai import OpenAIEmbedding  # lazy
        return OpenAIEmbedding()
    raise ValueError(
        f"Unknown EMBEDDING_PROVIDER={name!r}. Implement it in "
        "agents/shared/embeddings*.py and register it in make_embedder()."
    )
