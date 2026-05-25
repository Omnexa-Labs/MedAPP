# Agent memory architecture

Companion to [`storage.md`](storage.md) and ADR 0003. This document specifies
the concrete shape of patient memory as consumed and produced by the agent
layer.

## Mental model

The agent layer does **not** own patient data. It owns *indexes over* patient
data, plus two new categories (conversational and recommendation memory) that
no other service produces.

```
        ┌──────────────────── canonical (Postgres) ────────────────────┐
        │  ehr_service     wearable_sync_service   user_service        │
        │  (profile,       (vitals trends)         (identity,          │
        │   timeline,                              consents)           │
        │   meds,                                                      │
        │   allergies)                                                 │
        └──────────────────────────┬───────────────────────────────────┘
                                   │ summary endpoints (HTTP)
                                   ▼
        ┌───────────── agents/shared/memory.py ─────────────┐
        │                                                   │
        │   retrieve_context(patient_id, query) →           │
        │       ContextBundle {                             │
        │         summary,                                  │
        │         recent_topics,                            │
        │         relevant_recommendations,                 │
        │         clinical_facts,                           │
        │       }                                           │
        │                                                   │
        └─────┬─────────────────────────────────┬───────────┘
              │ read                            │ read
              ▼                                 ▼
    ┌──── Qdrant ────┐               ┌──── service summaries ────┐
    │ conversation_  │               │  ehr/summary              │
    │   memory       │               │  ehr/medications          │
    │ recommendation │               │  booking/upcoming         │
    │   _memory      │               │  wearable/trends          │
    │ medical_       │               └───────────────────────────┘
    │   knowledge*   │
    └────────────────┘
    *future, non-PHI, ADR TBD
```

## Collections

### `conversation_memory`

A rolled-up summary of one slice of a conversation (typically 1–5 turns).
Created at the end of each `/chat` turn by the responding agent.

**Vector** — embedding of the summary text (dims = embedding provider's
native size; bge-small = 384).

**Payload**:

| Key | Type | Notes |
|---|---|---|
| `patient_id` | string (UUID) | **Required filter on every query.** |
| `agent` | string | `concierge` / `medical_chat` / `smart_recommend` / etc. |
| `conversation_id` | string (UUID) | Groups summaries of one user session. |
| `created_at` | ISO 8601 timestamp | UTC. |
| `topics` | list[string] | Surface-level tags, e.g. `["headache","sleep"]`. |
| `redacted` | bool | True if PII was scrubbed before embedding. |

**Retention**: 18 months sliding. Older summaries are exported to MongoDB
narrative archive (cold) and deleted from Qdrant.

**Index**: payload index on `patient_id` (mandatory) and `created_at`
(for time-bounded queries).

### `recommendation_memory`

One record per recommendation made by any agent, plus its lifecycle.

**Vector** — embedding of the recommendation text (so semantic dedup is
possible: "did we already suggest this?").

**Payload**:

| Key | Type | Notes |
|---|---|---|
| `patient_id` | string (UUID) | Required filter. |
| `kind` | enum | `lifestyle` / `medication` / `followup` / `labs` / `wellness`. |
| `created_at` | ISO 8601 timestamp | UTC. |
| `status` | enum | `proposed` / `accepted` / `ignored` / `completed`. |
| `source_agent` | string | Which agent generated it. |
| `evidence` | list[string] | Brief pointers — `"glucose trend +12% over 90d"`. |
| `expires_at` | ISO 8601 \| null | When the recommendation stops being valid. |

**Retention**: indefinite. Recommendations are a training signal for the
smart-recommend agent; we want long history.

### `medical_knowledge` (out of scope for ADR 0003)

Clinical guidelines, drug references, lab ranges. Non-PHI, can use external
embedding providers. Will be addressed in a separate ADR when we wire up the
medical_chat agent's RAG over guidelines.

## Read path

```
                          ┌────────────────────────┐
   user message ─────────►│  intent_classify(msg)  │
                          └──────────┬─────────────┘
                                     │ "clinical" | "scheduling" | "smalltalk"
                ┌────────────────────┼─────────────────────┐
                ▼                    ▼                     ▼
       ┌────────────────┐    ┌──────────────────┐   ┌─────────────────┐
       │ get_ehr_       │    │ get_meds,        │   │ get_upcoming_   │
       │   summary      │    │ get_allergies    │   │   bookings      │
       └────────┬───────┘    └─────────┬────────┘   └────────┬────────┘
                │                      │                     │
                └──────────────────────┼─────────────────────┘
                                       ▼
                         ┌─────────────────────────────┐
                         │ qdrant.query(               │
                         │   collection="conversation",│
                         │   filter=patient_id,        │
                         │   query_vector=embed(msg),  │
                         │   limit=k_conv)             │
                         └─────────────┬───────────────┘
                                       ▼
                         ┌─────────────────────────────┐
                         │ qdrant.query(               │
                         │   collection="recommend",   │
                         │   filter=patient_id+kind?,  │
                         │   limit=k_rec)              │
                         └─────────────┬───────────────┘
                                       ▼
                         ┌─────────────────────────────┐
                         │ compress(token_budget=1500) │
                         └─────────────┬───────────────┘
                                       ▼
                              ContextBundle  ─► LLM
```

The whole pipeline runs in a single `async def retrieve_context()` call.
Service summary calls run in parallel via `asyncio.gather`; Qdrant calls run
sequentially because the second query reuses the embedded user message.

## Write path

### Conversational memory

1. Agent finishes generating reply.
2. Agent enqueues a background task (`asyncio.create_task`) with the request
   message + reply.
3. Background task calls the LLM with a short summarisation prompt
   (`prompts/_memory_summary.md`, token cap 200).
4. Summary text is PHI-redacted via `agents/shared/phi.py::redact()`.
5. Summary is embedded.
6. Upserted to Qdrant with the payload above.
7. Failures: logged at `WARNING`, dropped. Memory write is best-effort.

The user-facing reply does **not** wait on steps 3–6. /chat latency stays at
LLM-roundtrip latency.

### Recommendation memory

Written by the Smart Recommendation Agent (future). Schema is reserved here
so other agents can read it before that agent is built.

## ContextBundle shape

The Pydantic model returned by `retrieve_context`:

```python
class Recommendation(BaseModel):
    kind: Literal["lifestyle","medication","followup","labs","wellness"]
    text: str
    status: Literal["proposed","accepted","ignored","completed"]
    created_at: datetime

class ClinicalFacts(BaseModel):
    active_conditions: list[str] = []
    active_medications: list[str] = []
    allergies: list[str] = []
    last_vitals: dict[str, Any] = {}

class ContextBundle(BaseModel):
    summary: str                              # 1-paragraph narrative
    recent_topics: list[str] = []
    relevant_recommendations: list[Recommendation] = []
    clinical_facts: ClinicalFacts
    token_estimate: int                       # for budgeting in agent
```

Injected into the LLM system prompt under a fixed heading so the prompt cache
key changes only when the context block changes, not the persona prompt.

## Module layout

```
agents/shared/
  embeddings.py         # EmbeddingProvider protocol + MockEmbedding
  memory.py             # retrieve_context + write_conversation_summary
  qdrant_client.py      # thin async wrapper around qdrant-client
  providers/
    __init__.py
    openai_compat.py    # shared base for OpenAI-wire-format providers
    groq_provider.py    # imports openai_compat; GROQ_API_KEY + base URL
    openai_provider.py  # imports openai_compat; OPENAI_API_KEY (+ Azure)
prompts/
  _memory_summary.md    # leading underscore = shared, not a persona
```

`base_agent.py` gains:

```python
class BaseAgent:
    name: str = "base"
    enable_memory: bool = True

    async def handle(self, req: AgentRequest) -> AgentResponse: ...
```

and `make_app` wires `retrieve_context` into the `/chat` handler when
`enable_memory` is True, so subclasses don't need to remember to call it.

## Failure modes and degradation

| Failure | Behaviour |
|---|---|
| Qdrant unreachable | `retrieve_context` returns a `ContextBundle` with empty vector-derived fields but populated `clinical_facts` (from EHR). Log warning. Agent still replies. |
| Embedding provider down | Skip vector retrieval; same degradation as above. |
| `ehr_service` down | `clinical_facts` is empty; vector retrieval still runs. Agent reply is generic; log error. |
| LLM provider down | /chat returns 503; nothing is written. |
| Memory write failure | Logged, swallowed. The next turn just won't have the previous turn's summary; conversation history in `AgentRequest.history` still works. |

## Compliance notes

- All payload fields are PHI by default. Qdrant must be deployed in-VPC with
  encryption at rest and access restricted to the agent layer's service
  account.
- The summarisation prompt explicitly forbids the LLM from inventing facts.
  Anything not present in the input must not appear in the summary.
- `redacted: true` payload flag exists for audit. Even with redaction, the
  embedding vector itself is treated as PHI for storage/access purposes
  (it's derived from PHI text).
- HIPAA "minimum necessary" — the ContextBundle is the *only* thing the LLM
  sees from memory; raw Qdrant payloads never reach the model.

## Out of scope for this slice

- `medical_knowledge` collection — needs its own ADR.
- Cross-patient retrieval (e.g. cohort analysis) — never in this layer;
  belongs in analytics service.
- Multi-modal embeddings for lab images — that's `lab_reader_agent`'s problem.
- Streaming / token-stream UX — separate concern.
- Recommendation writer — Smart Recommendation Agent (future ADR).
