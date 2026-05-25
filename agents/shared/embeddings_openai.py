"""OpenAI embedding provider.

Loaded lazily by `embeddings.make_embedder("openai")`. Requires the
`agents[openai]` extra and an `OPENAI_API_KEY`. Defaults to
`text-embedding-3-small` (1536 dim) — change via `OPENAI_EMBEDDING_MODEL`.

**Do not use this for PHI** unless `ALLOW_EXTERNAL_PHI_EMBEDDING=true` and
OpenAI is covered by a BAA for your deployment. The guard lives in
`memory.py`; this module is just transport.
"""
from __future__ import annotations

import os


class OpenAIEmbedding:
    dim: int = 1536  # text-embedding-3-small default

    def __init__(
        self,
        model: str | None = None,
        api_key: str | None = None,
        base_url: str | None = None,
    ) -> None:
        try:
            from openai import OpenAI
        except ImportError as e:
            raise ImportError(
                "OpenAIEmbedding requires the `agents[openai]` extra."
            ) from e
        self._model = model or os.getenv(
            "OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"
        )
        # text-embedding-3-large = 3072 dim; keep `dim` accurate or downstream
        # Qdrant collection creation will fail.
        if "large" in self._model:
            self.dim = 3072
        self._client = OpenAI(
            api_key=api_key or os.getenv("OPENAI_API_KEY"),
            base_url=base_url or os.getenv("OPENAI_BASE_URL"),
        )

    def embed(self, texts: list[str]) -> list[list[float]]:
        resp = self._client.embeddings.create(model=self._model, input=texts)
        return [item.embedding for item in resp.data]
