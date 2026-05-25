# ADR 0003 — Patient memory & RAG foundation

- **Status**: Proposed
- **Date**: 2026-05-21

## Context

The agent layer currently has no memory. Every `/chat` turn is stateless;
history is only what the caller passes in `AgentRequest.history`. The product
vision (see `MedApp — Medical Chat Agent System Prompt & Product Context`)
requires longitudinal patient memory across five categories:

1. **Profile** — age, sex, allergies, chronic conditions, medications.
2. **Medical timeline** — visits, diagnoses, labs, prescriptions, surgeries.
3. **Conversational memory** — summarised history of agent interactions.
4. **Wearable memory** — continuous vitals trends.
5. **Recommendation memory** — what was suggested, what landed, what didn't.

`docs/architecture/storage.md` already assigns ownership: Profile, Timeline, and
Wearable memory live in `ehr_service` / `wearable_sync_service` / `user_service`
(PostgreSQL). Qdrant is designated for "retrieval embeddings for RAG and
document search". RabbitMQ is the cross-service event bus.

Two categories are currently **unowned**: Conversational and Recommendation
memory. Without them the agents cannot do longitudinal reasoning even though
the underlying data exists.

## Decision

### Ownership

- **Conversational memory** and **Recommendation memory** are owned by the
  agent layer (this repo), stored in **Qdrant** with payload metadata in
  PostgreSQL via `ehr_service`'s `document_metadata` surface.
- **Profile, Timeline, and Wearable memory** are *not* duplicated. The agent
  layer reads them via summary endpoints on the owning services. This
  preserves the "one service, one source of truth" rule from `storage.md`.

### Provider abstraction

- Introduce `EmbeddingProvider` in `agents/shared/embeddings.py` mirroring the
  existing `LLMProvider` pattern: small protocol, vendor-agnostic, `MockEmbedding`
  as the default for dev/CI (deterministic hash-based vectors so retrieval is
  reproducible without network).
- Embedding provider is selected via env (`EMBEDDING_PROVIDER=mock|openai|local`).
- Default in prod is `local` (sentence-transformers / bge-small) running
  in-cluster — this is the only way to embed PHI without expanding our BAA
  surface area. `openai` is available behind the extra `agents[openai]` for
  non-PHI use cases (e.g. embedding the medical knowledge base).

### Qdrant collection layout

Two collections, both filtered by `patient_id` in payload:

| Collection | Vectors | Payload keys | Retention |
|---|---|---|---|
| `conversation_memory` | summary of a conversation segment (1–5 turns rolled up by the agent at end of turn) | `patient_id`, `agent`, `conversation_id`, `created_at`, `topics: [str]`, `redacted: bool` | 18 months sliding |
| `recommendation_memory` | text of a recommendation + outcome | `patient_id`, `kind` (lifestyle\|medication\|followup\|labs), `created_at`, `status` (proposed\|accepted\|ignored\|completed), `source_agent` | indefinite (training signal) |

A third collection, `medical_knowledge`, is allowed but **out of scope** for
this ADR. It will hold clinical guidelines, drug references, and lab ranges —
non-PHI, can use OpenAI embeddings, addressed in a later ADR.

Vector size is determined by the embedding provider and stored on the
collection; switching providers requires re-embedding. The mock provider uses
384 dims to match bge-small.

### Retrieval pipeline

Implemented in `agents/shared/memory.py` as a single function
`retrieve_context(patient_id, query, *, k_conv=4, k_rec=3) -> ContextBundle`.

Pipeline steps:

1. **Intent classify** (cheap, prompt-only via the chosen LLM): does the user
   need clinical context, scheduling context, or neither? Cuts unnecessary
   retrieval.
2. **Service summaries** (HTTP, parallel via `asyncio.gather`):
   - `ehr_service` patient summary (always)
   - active medications, allergies (if intent ⊇ clinical)
   - upcoming bookings (if intent ⊇ scheduling)
3. **Vector retrieve** from Qdrant: top-`k_conv` from `conversation_memory`
   and top-`k_rec` from `recommendation_memory`, payload-filtered by
   `patient_id`. Done in a single Qdrant call where possible.
4. **Compress** into a `ContextBundle` (a Pydantic model with `summary: str`,
   `recent_topics: list[str]`, `relevant_recommendations: list[Rec]`,
   `clinical_facts: dict`). Token budget configurable, default 1500 tokens.
5. **Inject** as a structured block in the LLM system prompt, separate from
   the agent persona prompt. Persona stays static and `cache_control:
   ephemeral`; the context block is per-request.

### Write path

- **Conversational memory**: at the end of each `/chat` turn, the agent calls
  `memory.write_conversation_summary(patient_id, turn)`. This generates a
  short summary via the LLM (capped at ~200 tokens), embeds it, and upserts to
  Qdrant. Done in an **`asyncio.create_task`**, not awaited, so /chat latency
  is unaffected. Failures are logged and dropped (best-effort write).
- **Recommendation memory**: written by the Smart Recommendation Agent
  (future ADR). For now, schema is reserved; no writer.

### PHI handling

- All conversational summaries are PHI by default.
- Before embedding, summaries pass through `agents/shared/phi.py::redact()`
  to scrub emails/phones/SSNs from the *summary text*. Diagnoses and symptom
  names are intentionally preserved — that's the signal we need.
- Embeddings of PHI must be generated by an embedding model running inside
  our VPC (default `local` provider). Sending PHI to a third-party embedding
  API is gated behind `ALLOW_EXTERNAL_PHI_EMBEDDING=false` (default false).

## Rejected alternatives

- **One mega-collection** indexed by content-type payload: harder to set
  retention per type, harder to evict, blast radius of a bad payload schema
  change is larger.
- **One Qdrant collection per patient**: clean isolation but hits Qdrant's
  per-collection overhead at our target scale (millions of patients).
- **Postgres `pgvector` instead of Qdrant**: storage.md already names Qdrant;
  changing now would invalidate prior decisions and the existing infra.
- **Sync write of conversational memory inside `/chat`**: adds an embed+upsert
  to the critical path of every reply. Background task is fine because the
  memory only needs to be retrievable on the *next* turn, not the current
  one.

## Consequences

- **Good**: Agents become context-aware on the next turn after we land this.
  Existing concierge agent picks up memory for free by calling
  `retrieve_context` before invoking the LLM. Other agents (chat, recommend,
  vitals) get the same upgrade with no per-agent memory code.
- **Good**: Source-of-truth boundaries from `storage.md` are preserved — we
  add two new indexes, we do not duplicate the canonical stores.
- **Cost**: We now operate Qdrant as a hot-path dependency. Outage of Qdrant
  must degrade gracefully (retrieval returns empty `ContextBundle`, agents
  still respond, log a warning).
- **Cost**: Embedding model choice locks us in until we re-embed. We'll
  start with `bge-small-en-v1.5` (384 dims, English-only) and revisit when
  multilingual support is needed.
- **Open question — left for implementation**: where the rollup-to-summary
  prompt lives. Proposing `agents/prompts/_memory_summary.md` (leading
  underscore = shared, not an agent persona). Will confirm during build.
- **Open question — left for implementation**: whether `retrieve_context` is
  called from `BaseAgent.handle` (every agent gets it) or opt-in per agent.
  Proposing every agent, with an `enable_memory: bool = True` on `BaseAgent`
  for opt-out.
