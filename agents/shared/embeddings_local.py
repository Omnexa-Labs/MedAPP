"""Local sentence-transformers embedding provider.

Loaded lazily by `embeddings.make_embedder("local")`. Requires the
`agents[local-embed]` extra to be installed. The model runs in-process, in
our VPC — this is the PHI-safe default for production.
"""
from __future__ import annotations


class LocalEmbedding:
    """bge-small-en-v1.5 via sentence-transformers.

    Dim = 384. English only. Multilingual upgrade is a follow-up ADR.
    """

    dim: int = 384

    def __init__(self, model_name: str = "BAAI/bge-small-en-v1.5") -> None:
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as e:
            raise ImportError(
                "LocalEmbedding requires the `agents[local-embed]` extra. "
                "Run `uv sync --extra local-embed`."
            ) from e
        self._model = SentenceTransformer(model_name)

    def embed(self, texts: list[str]) -> list[list[float]]:
        # normalize_embeddings=True so cosine similarity == dot product;
        # Qdrant collections will be configured with Cosine distance.
        vectors = self._model.encode(
            texts,
            normalize_embeddings=True,
            convert_to_numpy=True,
        )
        return vectors.tolist()
