"""Patient memory + retrieval pipeline.

See ADR 0003 and `docs/architecture/agent_memory.md` for the design.

This module is what agents actually use. Two entry points:

- `MemoryService.retrieve_context(patient_id, query)` → `ContextBundle`
- `MemoryService.write_conversation_summary(patient_id, ...)` → fire-and-forget

The service degrades gracefully: if Qdrant is unreachable, retrieval returns
an empty bundle with whatever clinical facts came back from `ehr_service`.
The agent still responds. The failure is logged.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

import httpx
from pydantic import BaseModel, Field

from .embeddings import EmbeddingProvider, make_embedder
from .phi import redact
from .qdrant_client import AsyncQdrantWrapper, QdrantClientLike, QdrantPoint

logger = logging.getLogger(__name__)


CONVERSATION_COLLECTION = "conversation_memory"
RECOMMENDATION_COLLECTION = "recommendation_memory"


# ── Data shapes (the ContextBundle the agent sees) ───────────────────────────


class Recommendation(BaseModel):
    kind: Literal["lifestyle", "medication", "followup", "labs", "wellness"]
    text: str
    status: Literal["proposed", "accepted", "ignored", "completed"] = "proposed"
    created_at: datetime


class ClinicalFacts(BaseModel):
    active_conditions: list[str] = Field(default_factory=list)
    active_medications: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)
    last_vitals: dict[str, Any] = Field(default_factory=dict)


class ContextBundle(BaseModel):
    """The compressed memory + clinical context handed to the LLM.

    Rendered into the system prompt under a fixed heading. Keep `summary`
    short (1–2 paragraphs) so the prompt cache key stays small.
    """

    summary: str = ""
    recent_topics: list[str] = Field(default_factory=list)
    relevant_recommendations: list[Recommendation] = Field(default_factory=list)
    clinical_facts: ClinicalFacts = Field(default_factory=ClinicalFacts)
    token_estimate: int = 0

    def render(self) -> str:
        """Format for injection into a system prompt.

        Fixed section ordering so caching downstream is stable per-patient.
        """
        if not (self.summary or self.recent_topics or self.relevant_recommendations
                or self.clinical_facts.active_conditions
                or self.clinical_facts.active_medications):
            return ""

        lines = ["## Patient context", ""]
        if self.summary:
            lines.append(self.summary)
            lines.append("")
        cf = self.clinical_facts
        if cf.active_conditions:
            lines.append(f"- Active conditions: {', '.join(cf.active_conditions)}")
        if cf.active_medications:
            lines.append(f"- Current medications: {', '.join(cf.active_medications)}")
        if cf.allergies:
            lines.append(f"- Allergies: {', '.join(cf.allergies)}")
        if self.recent_topics:
            lines.append(f"- Recent topics: {', '.join(self.recent_topics)}")
        if self.relevant_recommendations:
            lines.append("- Open recommendations:")
            for r in self.relevant_recommendations:
                lines.append(f"  - [{r.kind}] {r.text} (status: {r.status})")
        return "\n".join(lines).strip()


# ── Service ──────────────────────────────────────────────────────────────────


class MemoryService:
    """All memory operations live here.

    Constructed once per agent process. Wire it via `BaseAgent`.
    """

    def __init__(
        self,
        *,
        qdrant: QdrantClientLike,
        embedder: EmbeddingProvider,
        ehr_service_url: str | None = None,
        ehr_http: httpx.AsyncClient | None = None,
        allow_external_phi_embedding: bool | None = None,
        embedder_is_external: bool = False,
    ) -> None:
        self._qdrant = qdrant
        self._embedder = embedder
        self._ehr_url = ehr_service_url
        # Allow injection of a pre-built httpx client (for tests / shared pool).
        self._http = ehr_http
        self._embedder_is_external = embedder_is_external
        if allow_external_phi_embedding is None:
            allow_external_phi_embedding = (
                os.getenv("ALLOW_EXTERNAL_PHI_EMBEDDING", "false").lower() == "true"
            )
        self._allow_external_phi = allow_external_phi_embedding
        if embedder_is_external and not self._allow_external_phi:
            logger.warning(
                "MemoryService initialised with an external embedding provider "
                "but ALLOW_EXTERNAL_PHI_EMBEDDING is false. PHI writes will be "
                "rejected; only the medical_knowledge collection (non-PHI) is "
                "safe to embed externally."
            )

    # ── Bootstrap ────────────────────────────────────────────────────────────

    async def ensure_collections(self) -> None:
        await self._qdrant.ensure_collection(
            CONVERSATION_COLLECTION, vector_size=self._embedder.dim
        )
        await self._qdrant.ensure_collection(
            RECOMMENDATION_COLLECTION, vector_size=self._embedder.dim
        )

    # ── Read path ────────────────────────────────────────────────────────────

    async def retrieve_context(
        self,
        patient_id: str,
        query: str,
        *,
        k_conv: int = 4,
        k_rec: int = 3,
    ) -> ContextBundle:
        """Build a ContextBundle for the given patient + user query.

        Degrades to an empty bundle on any component failure. Never raises.
        """
        clinical = await self._fetch_clinical_facts(patient_id)

        try:
            vec = self._embedder.embed([query])[0]
        except Exception:
            logger.exception("memory.embed_failed")
            return ContextBundle(clinical_facts=clinical)

        conv_hits = await self._safe_search(
            CONVERSATION_COLLECTION, vec, patient_id, k_conv
        )
        rec_hits = await self._safe_search(
            RECOMMENDATION_COLLECTION, vec, patient_id, k_rec
        )

        topics: list[str] = []
        seen: set[str] = set()
        for h in conv_hits:
            for t in h.payload.get("topics", []) or []:
                if t not in seen:
                    seen.add(t)
                    topics.append(t)

        recs = [
            Recommendation(
                kind=h.payload.get("kind", "wellness"),
                text=h.payload.get("text", ""),
                status=h.payload.get("status", "proposed"),
                created_at=_parse_dt(h.payload.get("created_at")),
            )
            for h in rec_hits
            if h.payload.get("text")
        ]

        summary_parts = [h.payload.get("summary", "") for h in conv_hits]
        summary = " ".join(s for s in summary_parts if s).strip()

        bundle = ContextBundle(
            summary=summary,
            recent_topics=topics[:8],
            relevant_recommendations=recs,
            clinical_facts=clinical,
        )
        bundle.token_estimate = _rough_tokens(bundle.render())
        return bundle

    async def _fetch_clinical_facts(self, patient_id: str) -> ClinicalFacts:
        if not self._ehr_url:
            return ClinicalFacts()
        try:
            http = self._http or httpx.AsyncClient(timeout=5.0)
            try:
                resp = await http.get(
                    f"{self._ehr_url}/records/{patient_id}/summary",
                    headers={"X-Patient-Id": patient_id},
                )
            finally:
                if self._http is None:
                    await http.aclose()
        except Exception:
            logger.exception("memory.ehr_fetch_failed")
            return ClinicalFacts()
        if resp.status_code >= 400:
            logger.warning("memory.ehr_non_ok status=%s", resp.status_code)
            return ClinicalFacts()
        try:
            data = resp.json()
        except ValueError:
            return ClinicalFacts()
        return ClinicalFacts(
            active_conditions=data.get("active_conditions", []) or [],
            active_medications=data.get("active_medications", []) or [],
            allergies=data.get("allergies", []) or [],
            last_vitals=data.get("last_vitals", {}) or {},
        )

    async def _safe_search(self, collection: str, vec: list[float], patient_id: str, k: int):
        try:
            return await self._qdrant.search(
                collection, vector=vec, patient_id=patient_id, limit=k
            )
        except Exception:
            logger.exception("memory.qdrant_search_failed collection=%s", collection)
            return []

    # ── Write path ───────────────────────────────────────────────────────────

    async def write_recommendation(
        self,
        patient_id: str,
        *,
        text: str,
        kind: str,
        source_agent: str,
        evidence: list[str] | None = None,
        dedup_key: str | None = None,
        expires_at: datetime | None = None,
    ) -> None:
        """Upsert a recommendation into `recommendation_memory`.

        If `dedup_key` is provided, an existing recommendation with the same
        key for this patient is overwritten — that's how we avoid spamming
        the patient with the same nudge on every analysis run.

        Best-effort. Failures are logged, not raised.
        """
        if not text.strip():
            return
        if self._embedder_is_external and not self._allow_external_phi:
            logger.warning("memory.recommendation_write_blocked external_embedder_for_phi")
            return

        try:
            vec = self._embedder.embed([text])[0]
        except Exception:
            logger.exception("memory.recommendation_embed_failed")
            return

        # Deterministic ID per (patient_id, dedup_key) → upserts overwrite.
        # Without a dedup_key, every write produces a fresh point.
        point_id = (
            f"{patient_id}:{dedup_key}" if dedup_key else str(uuid.uuid4())
        )
        # Qdrant only accepts UUID or unsigned int point IDs; derive a stable
        # UUID5 from our composite string when we need determinism.
        if dedup_key:
            point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, point_id))

        payload: dict[str, Any] = {
            "patient_id": patient_id,
            "kind": kind,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": "proposed",
            "source_agent": source_agent,
            "evidence": evidence or [],
            "dedup_key": dedup_key or "",
            "text": text,
        }
        if expires_at is not None:
            payload["expires_at"] = expires_at.isoformat()

        try:
            await self._qdrant.upsert(
                RECOMMENDATION_COLLECTION,
                [QdrantPoint(id=point_id, vector=vec, payload=payload)],
            )
        except Exception:
            logger.exception("memory.recommendation_upsert_failed")

    async def list_open_recommendations(
        self,
        patient_id: str,
        *,
        limit: int = 20,
    ) -> list[Recommendation]:
        """Return the patient's recent recommendations with status='proposed'.

        Vector-search-by-zeros is a Qdrant convention for "give me everything
        matching the filter, ranked arbitrarily". We use it here because the
        caller doesn't have a semantic query — they just want the open list.
        """
        try:
            hits = await self._qdrant.search(
                RECOMMENDATION_COLLECTION,
                vector=[0.0] * self._embedder.dim,
                patient_id=patient_id,
                limit=limit,
                extra_filter={"status": "proposed"},
            )
        except Exception:
            logger.exception("memory.list_recommendations_failed")
            return []
        recs: list[Recommendation] = []
        for h in hits:
            text = h.payload.get("text") or h.payload.get("summary")
            if not text:
                continue
            recs.append(
                Recommendation(
                    kind=h.payload.get("kind", "wellness"),
                    text=text,
                    status=h.payload.get("status", "proposed"),
                    created_at=_parse_dt(h.payload.get("created_at")),
                )
            )
        # Most recent first.
        recs.sort(key=lambda r: r.created_at, reverse=True)
        return recs

    async def write_conversation_summary(
        self,
        patient_id: str,
        *,
        summary: str,
        agent: str,
        conversation_id: str | None = None,
        topics: list[str] | None = None,
    ) -> None:
        """Best-effort upsert of one conversational memory point.

        Caller is expected to summarise before calling — typically the agent
        feeds (user_msg, reply) to the LLM with `prompts/_memory_summary.md`
        and passes the result here.
        """
        if not summary.strip():
            return
        if self._embedder_is_external and not self._allow_external_phi:
            logger.warning("memory.write_blocked external_embedder_for_phi")
            return

        redacted_summary = redact(summary)
        try:
            vec = self._embedder.embed([redacted_summary])[0]
        except Exception:
            logger.exception("memory.embed_failed_on_write")
            return

        point = QdrantPoint(
            id=str(uuid.uuid4()),
            vector=vec,
            payload={
                "patient_id": patient_id,
                "agent": agent,
                "conversation_id": conversation_id or str(uuid.uuid4()),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "topics": topics or [],
                "redacted": True,
                "summary": redacted_summary,
            },
        )
        try:
            await self._qdrant.upsert(CONVERSATION_COLLECTION, [point])
        except Exception:
            logger.exception("memory.qdrant_upsert_failed")


# ── Helpers ──────────────────────────────────────────────────────────────────


def _rough_tokens(text: str) -> int:
    # 1 token ≈ 4 chars for English. Good enough for budgeting decisions.
    return (len(text) + 3) // 4


def make_memory_service_from_env(
    *,
    ehr_service_url: str | None = None,
    ehr_http: httpx.AsyncClient | None = None,
) -> "MemoryService | None":
    """Construct a MemoryService from environment variables.

    Returns None if memory is disabled (`MEMORY_DISABLED=true`) or the
    minimum config is missing (`QDRANT_URL` unset). Callers that get None
    skip memory wiring entirely — `BaseAgent.build_system_prompt` and
    `persist_turn` both no-op in that case.

    Env vars consumed:
      - `MEMORY_DISABLED` — opt-out switch
      - `QDRANT_URL` — required
      - `QDRANT_API_KEY` — optional
      - `EMBEDDING_PROVIDER` — `mock` (default), `local`, `openai`
      - `ALLOW_EXTERNAL_PHI_EMBEDDING` — required `true` if using `openai`
        as the embedder for PHI workloads
    """
    if os.getenv("MEMORY_DISABLED", "false").lower() == "true":
        return None
    qdrant_url = os.getenv("QDRANT_URL")
    if not qdrant_url:
        logger.info("memory.disabled reason=qdrant_url_unset")
        return None
    provider_name = os.getenv("EMBEDDING_PROVIDER", "mock").lower()
    embedder = make_embedder(provider_name)
    qdrant = AsyncQdrantWrapper(qdrant_url, api_key=os.getenv("QDRANT_API_KEY"))
    return MemoryService(
        qdrant=qdrant,
        embedder=embedder,
        ehr_service_url=ehr_service_url,
        ehr_http=ehr_http,
        embedder_is_external=provider_name == "openai",
    )


def _parse_dt(raw: Any) -> datetime:
    if isinstance(raw, datetime):
        return raw
    if isinstance(raw, str):
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            pass
    return datetime.now(timezone.utc)
