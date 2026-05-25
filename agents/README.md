# MedApp Agents

Agentic AI layer. Each agent is a FastAPI service that drives an LLM (provider
configurable) to orchestrate MedApp backend microservices as tools, with a
shared patient memory layer for longitudinal context.

**No training, no model serving.** We don't fine-tune. We orchestrate an LLM
with tool use, plus retrieval over a patient memory index.

## LLM provider

Abstracted behind `LLMProvider` in `agents/shared/llm.py`. Three concrete
implementations registered today:

- `mock` — deterministic, no network, no key. Default in dev/CI.
- `groq` — OpenAI-compatible API at `api.groq.com`. Cheap, fast, **not
  HIPAA-covered**. Blocked by `make_provider` when `ENV=production`. See
  [ADR 0004](../docs/adr/0004-groq-llm-provider.md).
- `openai` — vanilla OpenAI or Azure OpenAI (via `OPENAI_BASE_URL`). Default
  prod provider for PHI workloads (under BAA).

Selection: `<AGENT>_LLM_PROVIDER=groq` (or per-process `LLM_PROVIDER`).

To add another provider, drop a module under `agents/shared/providers/`,
subclass `OpenAICompatProvider` if it speaks the OpenAI wire format, and
register a branch in `agents/shared/llm.py::make_provider()`.

## Embedding provider

Mirrors the LLM abstraction — `EmbeddingProvider` in
`agents/shared/embeddings.py`:

- `mock` — deterministic hash-based 384-dim vectors. Default.
- `local` — `bge-small-en-v1.5` via `sentence-transformers`. Requires
  `agents[local-embed]`. **PHI-safe** (runs in-process).
- `openai` — `text-embedding-3-small` (1536-dim) or `-large` (3072-dim).
  Requires `agents[openai]`. **Not PHI-safe unless** `ALLOW_EXTERNAL_PHI_EMBEDDING=true`
  *and* OpenAI under BAA for your deployment.

Selection: `EMBEDDING_PROVIDER=local`.

## Patient memory layer

See [ADR 0003](../docs/adr/0003-patient-memory-and-rag-foundation.md) and
[`docs/architecture/agent_memory.md`](../docs/architecture/agent_memory.md).

Two Qdrant collections owned by the agent layer:

| Collection | What | Retention |
|---|---|---|
| `conversation_memory` | Summarised turns, embedded | 18mo sliding |
| `recommendation_memory` | Recommendations + outcomes | indefinite |

Profile, timeline, vitals, and medication state are **not** duplicated here —
agents fetch those via summary endpoints on `ehr_service` and friends. See
[`docs/architecture/storage.md`](../docs/architecture/storage.md).

Per-turn flow in any agent that calls the helpers:

```
build_system_prompt(req, persona_prompt)
    → retrieve_context(patient_id, message)
        ├─ fetch ehr_service summary  (clinical_facts)
        ├─ qdrant.search conversation_memory  (summary + topics)
        └─ qdrant.search recommendation_memory (open recs)
    → ContextBundle.render() appended to persona prompt
provider.run(...)
persist_turn(req, reply)  ← fire-and-forget background write
```

## Agents

| Service | Port | Persona | Primary tools |
|---|---|---|---|
| concierge_agent | 9001 | Personal medical assistant — orchestrates everything else | search_providers, book_appointment, get_ehr, send_message |
| smart_recommend_agent | 9002 | Lifestyle, diet, and medication recommendations from EHR + wearables | get_ehr, get_vitals_history, get_medications |
| medical_chat_agent | 9003 | Long-form symptom triage and health Q&A | get_ehr, get_medications, lookup_drug_interactions |
| lab_reader_agent | 9004 | Reads uploaded lab results / prescriptions (vision) and explains them | upload_to_ehr, lookup_drug_interactions, find_specialist |
| vitals_watcher_agent | 9005 | Streams wearable data, alerts on anomalies, suggests action | get_vitals_history, send_alert, find_specialist |
| booking_agent | 9006 | Specialised "book me an appointment" sub-agent the concierge can call | search_providers, get_doctor_availability, create_booking, process_payment |

**All six agents are fully wired today.** Architectural decisions made
during the build are recorded as ADRs:

- [ADR 0002](../docs/adr/0002-llm-provider-deferred.md) — provider abstraction
- [ADR 0003](../docs/adr/0003-patient-memory-and-rag-foundation.md) — patient memory + RAG
- [ADR 0004](../docs/adr/0004-groq-llm-provider.md) — Groq as first provider
- [ADR 0005](../docs/adr/0005-wire-compatible-domain-events.md) — wire-compatible domain events
- [ADR 0006](../docs/adr/0006-vision-in-llm-provider.md) — vision in `LLMProvider`
- [ADR 0007](../docs/adr/0007-deterministic-engine-llm-personalizer.md) — deterministic engine + LLM personalizer split
- [ADR 0008](../docs/adr/0008-agent-jwt-auth-and-idor-guard.md) — agent JWT auth + IDOR guard

## Conventions

- **Provider-agnostic.** Tool definitions are plain JSON schemas. Prompts are
  plain Markdown. Vendor SDKs are loaded lazily per-provider.
- **Tools are HTTP wrappers** around internal MedApp services. The agent
  forwards `patient_id` as `X-Patient-Id` for row-level access control.
- **PHI never goes to logs/traces.** Use `agents/shared/phi.py::redact()`
  before `structlog.bind()` or attaching anything to a span. Conversational
  summaries are redacted before they hit Qdrant.
- **Agents are stateless** beyond memory. Conversation state lives in Qdrant
  (summarised) and the canonical services (clinical state); the patient ID
  arrives in each `/chat` request.
- **Memory is opt-out, not opt-in.** `BaseAgent` builds the context bundle
  for every agent that calls `build_system_prompt()`. Unset
  `QDRANT_URL` or set `MEMORY_DISABLED=true` to skip it.

## Layout

```
agents/
  shared/
    llm.py                # LLMProvider protocol + MockLLM + make_provider()
    embeddings.py         # EmbeddingProvider protocol + MockEmbedding
    embeddings_local.py   # bge-small via sentence-transformers (lazy)
    embeddings_openai.py  # OpenAI embeddings (lazy)
    qdrant_client.py      # AsyncQdrantWrapper + InMemoryQdrant test double
    memory.py             # MemoryService.retrieve_context / write_conversation_summary
    base_agent.py         # FastAPI factory + build_system_prompt + persist_turn
    medapp_client.py      # httpx client that forwards X-Patient-Id
    phi.py                # redaction
    providers/
      openai_compat.py    # shared OpenAI wire-format base (tool-call loop)
      groq_provider.py    # Groq via OpenAI-compat
      openai_provider.py  # OpenAI / Azure via OpenAI-compat
  prompts/                # one .md per agent — frozen system prompts
                          # plus _memory_summary.md for the summariser
  services/<agent>/
    app/
      main.py             # FastAPI + /chat
      config.py           # env-driven settings
      agent.py            # wires LLMProvider + memory + tools + prompt
      tools.py            # tool definitions + executors
    Dockerfile
    pyproject.toml
    tests/
  tests/                  # shared-library tests (embeddings, memory, providers)
```

## Auth & secrets

All agent `/chat` and `/analyze` endpoints require a verified JWT in
`Authorization: Bearer <token>`. `/healthz` stays unauthenticated for
container probes.

The token is minted by `user_service` (or equivalent identity issuer)
using the **same** `jwt_secret`/`jwt_algorithm` the agent is configured
with. Long-term we should move to RS256 with a public-key fetch; today
this is HS256 with a shared symmetric secret (known weakness, see
[ADR TBD]).

### IDOR guard (audit finding #4)

The `patient_id` used for downstream lookups comes from the verified
JWT `sub` claim — **never** from the request body.

- Patient-role tokens: any `patient_id` in the body that differs from
  the token subject → **403 Forbidden**.
- Admin-role tokens: may specify any `patient_id` (operator workflows).
- Missing `patient_id` in the body: derived from the JWT subject.

This is enforced once in [`agents/shared/base_agent.py::enforce_patient_scope`](shared/base_agent.py)
and reused on `/analyze` via `app.state.require_principal`.

### Startup validation (audit finding #2)

[`agents/shared/auth.py::validate_jwt_secret`](shared/auth.py) is called
at `make_app` time. If `ENV=production` and the secret is empty or a
known-weak default (`change-me`, `change-me-change-me-...`, etc.), the
agent **refuses to boot**. Outside production it logs a warning and
returns `503 service unavailable` on any `/chat` until configured —
better than silently accepting forged tokens.

### Minting a test token

```python
from agents.shared import issue_test_token

token = issue_test_token(
    "patient-uuid",
    secret="<same as agent jwt_secret>",
    role="patient",       # or "admin"
    ttl_seconds=300,
)
# Authorization: Bearer <token>
```

## Notification dispatch

Agents that detect something the patient should hear about (smart_recommend
recommendations, vitals_watcher anomalies) push to
[`notification_service`](../backend/services/notification_service) via the
shared `NotificationDispatcher`
([`agents/shared/notify.py`](shared/notify.py)).

### Severity → channels routing

| Severity (caller-supplied) | Channels sent |
|---|---|
| `info` | `in_app` only — surfaces in the feed when the patient opens the app |
| `warn` / `warning` | `in_app` + `push` |
| `urgent` / `critical` | `in_app` + `push` (slice 2 will add `sms` for `critical`) |

Conservative on purpose. Pushing for every info-level insight would train
the patient to ignore alerts; the in-app feed is the universal fallback.

### Two-tier suppression

A burst of upload events that bypasses the agent-level throttle (300s for
smart_recommend, 60s for vitals_watcher) can still re-fire detection.
`NotificationDispatcher` adds a second-tier suppression keyed by
`(patient_id, dedup_key)` with a default 6-hour window. Same nudge → no
duplicate notification within that window, even if the underlying detector
fires multiple times.

### What gets sent to notification_service

```jsonc
POST /v1/notifications/send
Authorization: Bearer <service_token>
X-Patient-Id: <patient_id>

{
  "event_id": "smart_recommend.followup.proposed:p1:rising:fasting_glucose:2026-05-21",
  "recipient_user_id": "<patient_id>",
  "event_type": "smart_recommend.followup.proposed",  // or "vitals_watcher.critical"
  "title": "Follow-up recommended",
  "body": "Your fasting glucose has been creeping up...",
  "channels": ["in_app", "push"]
}
```

`event_id` is composed from `(event_type, patient_id, dedup_key, UTC date)`
so notification_service can dedup server-side too — defence in depth.

### Failure modes

| Cause | Behaviour |
|---|---|
| `notification_service_url` empty | Dispatcher disabled. `notify()` returns False. No HTTP traffic. |
| Severity has no routing | Returns False without an HTTP call. |
| Same `(patient_id, dedup_key)` within suppression window | Returns False without an HTTP call. |
| `notification_service` returns 4xx/5xx | Logged, returns False. Agent's user-visible reply unaffected. |
| Network failure / timeout | Same — logged, returns False, agent keeps working. |

The agent layer treats notifications as **best-effort**. A broker / network
hiccup never blocks `/analyze`, `/chat`, or anomaly publishing.

### Per-pod suppression (caveat)

The suppression map is an in-memory `OrderedDict` per pod, same shape as
the agent throttle. When agents scale to >1 replica, two pods may each
emit one notification for the same dedup_key. Backend-side `event_id` dedup
catches that case today; promoting the dispatcher's map to Redis is
slice-2 work.

## Event-driven push (smart_recommend_agent)

`smart_recommend_agent` can run in two modes:

- **Pull mode** (`POST /analyze`) — always on. A caller (or another agent)
  triggers an analysis for a patient_id. Returns the generated
  recommendations.
- **Push mode** — when `SMART_RECOMMEND_AMQP_URL` is set, the agent
  subscribes to the `medapp.events` topic exchange and runs analysis on
  matching domain events.

### Subscribed routing keys

| Routing key | Triggered by | Status today |
|---|---|---|
| `wearable.vitals.uploaded` | wearable_sync_service after a successful sync | **live** — see [wearable_sync_service/app/routers/wearables.py](../backend/services/wearable_sync_service/app/routers/wearables.py) |
| `lab.result.created` | lab_service after a successful `/v1/lab/results/upload` | **live** — see [lab_service/app/routers/lab.py](../backend/services/lab_service/app/routers/lab.py) |
| `ehr.vital.recorded` | ehr_service after a successful vital write | **live** — see [ehr_service/app/routers/records.py](../backend/services/ehr_service/app/routers/records.py) |

`wearable.vitals.uploaded` is the first end-to-end producer. Event shape
(`data` field):

```jsonc
{
  "patient_id": "<uuid>",        // also in event.subject
  "synced_count": 2,             // only fires when > 0
  "failed_count": 0,
  "device": { "provider": "fitbit", "external_id": "fitbit-99" },
  "sample_kinds": ["heart_rate", "steps"]
}
```

`lab.result.created` payload (emitted by `lab_service`):

```jsonc
{
  "patient_id": "<uuid>",           // also in event.subject
  "result_id": "<uuid>",
  "lab_order_id": "<uuid>" | null,    // null for patient-initiated uploads
  "title": "CBC result",
  "source": "patient_upload",         // or "external_lab", "clinic", etc.
  "status": "received",
  "resulted_at": "..." | null
}
```

`ehr.vital.recorded` payload (emitted by `ehr_service`):

```jsonc
{
  "patient_id": "<uuid>",           // also in event.subject
  "vital_id": "<uuid>",
  "kind": "blood_pressure",
  "value": "120/80",                  // string in EHR (per VitalCreate schema)
  "unit": "mmHg" | null,
  "recorded_at": "..."
}
```

Note: a single wearable sync produces N `ehr.vital.recorded` events (one
per sample row) plus one `wearable.vitals.uploaded` event (one per upload
batch). The agent-side throttles (300s smart_recommend, 60s vitals_watcher)
absorb the duplication — no extra coordination needed.

`vitals.anomaly.detected` payload (emitted by `vitals_watcher_agent`):

```jsonc
{
  "patient_id": "<uuid>",                // also in event.subject
  "severity": "critical" | "warning",      // highest across the anomaly list
  "anomalies": [
    {
      "severity": "critical",
      "metric": "heart_rate",
      "value": 185.0,
      "unit": "bpm",
      "recorded_at": "2026-05-21T12:00:00+00:00",
      "rationale": "heart_rate 185.0 is critically high (> 180.0)",
      "dedup_key": "heart_rate:2026-05-21T12:00:00+00:00"
    }
  ],
  "device": { "provider": "fitbit", "external_id": "..." }  // forwarded if upstream included it
}
```

Empty anomaly lists are **not published** — silence on the bus means no
problems found.

## Lab Reader — the vision lane

`lab_reader_agent` is the first multimodal agent. It accepts a single
image of a lab report or prescription and returns structured rows plus
a plain-English summary.

### Endpoint

```http
POST /scan
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "image_b64": "iVBORw0KG...",
  "media_type": "image/png",       // image/png | image/jpeg | image/webp
  "doc_type_hint": "lab_report",     // optional: "lab_report" | "prescription"
  "patient_id": null                  // optional; admins may pass another patient
}
```

Response (`ScanResponse`):

```jsonc
{
  "patient_id": "<uuid>",                  // from verified JWT subject
  "doc_type": "lab_report",
  "tests": [
    {
      "name": "Hemoglobin",
      "value": 13.2,
      "unit": "g/dL",
      "reference_range": "12.0-15.5",
      "flag": "normal"                      // normal | low | high | critical
    }
  ],
  "summary": "One result, all values normal.",
  "confidence": "high",                     // high | medium | low
  "warnings": []
}
```

### Pipeline

```
POST /scan
  → JWT verified + IDOR-scoped (same as /chat, /analyze)
  → validate base64, media_type, size (≤ 5 MB decoded)
  → scan_image(provider, image_bytes, media_type)
       → LLM with extraction prompt + image attached (vision)
       → parser.parse(llm_reply)
           - extract JSON from prose-wrapped output
           - normalise types (value→float, flag→enum)
           - coerce invalid rows into warnings, not failures
  → ScanResponse
```

### Vision in the LLM layer

`LLMProvider.run()` gained an optional `images: list[ImagePart] | None`
parameter. Providers translate per their wire format:

- **`OpenAICompatProvider`** (used by Groq + OpenAI): converts the most
  recent user message's `content` to a list of typed parts and appends
  each image as `{"type": "image_url", "image_url": {"url": "data:...;base64,..."}}`.
- **`MockLLM`**: accepts and ignores images; surfaces a `(mock) saw N image(s)`
  line so vision-path tests can assert wiring without a real provider.
- **Other providers**: raise `NotImplementedError` on non-empty `images`.
  The scan orchestrator catches this and returns a low-confidence empty
  result — the agent stays up, the user gets an honest answer.

### Failure modes

| Input | Response |
|---|---|
| Missing/invalid JWT | 401 |
| Token A trying to scan for patient B | 403 |
| Unsupported `media_type` (e.g. PDF) | 415 |
| Bad base64 / zero-byte payload | 400 |
| Image > 5 MB | 413 |
| LLM crash or non-JSON output | 200 with `confidence: "low"` and a warning |
| Provider doesn't support vision | 200 with `confidence: "low"` and `"provider does not support vision"` warning |

### Out of scope for this slice

- **PDF / multi-page** documents. Single-image PNG/JPEG/WebP only.
- **GCS reference input.** Images ride in the request body; slice 2 will
  switch to "client uploads to GCS, sends signed URL to /scan."
- **Persistence.** Returned `ScanResponse` is the only artifact; nothing
  is written to `lab_service` or `recommendation_memory`. Slice 2 wires
  a `lab.result.created` emission when `confidence == "high"`.
- **Fallback OCR.** No Tesseract / Vision API fallback when vision LLM
  fails — slice 2 adds one for low-confidence retries.

## Vitals Watcher — the acute lane

`vitals_watcher_agent` is the *acute* counterpart to `smart_recommend`:
single-sample anomaly detection against medical thresholds, not trend
analysis over time. Both subscribe to `wearable.vitals.uploaded`; their
throttles and goals are independent.

| | smart_recommend | vitals_watcher |
|---|---|---|
| Looks at | Drifts over 90 days | Single recent samples |
| Throttle (per-patient) | 300s | 60s |
| Produces | `recommendation_memory` entries (persistent) | `vitals.anomaly.detected` events (transient) |
| Severity scale | info / warn / urgent | warning / critical |
| LLM in the hot path? | yes (personalizer) | no (push side); yes only on /chat |

Thresholds and severity tiers live in
[`services/vitals_watcher_agent/app/detectors.py`](services/vitals_watcher_agent/app/detectors.py).
The `/chat` endpoint re-runs the same detectors on demand via the
`get_recent_anomalies` LLM tool.

### Throttling

A burst of five vital uploads from the same wearable should not trigger
five analyses (the engines would produce the same `Signal`s anyway). The
dispatcher keeps an in-memory LRU of `patient_id → last_analyzed_at`. If
the same patient appears within `event_throttle_seconds` (default 300),
the event is dropped. **This is per-pod**. When the agent scales to
multiple replicas, this must move to Redis — flagged for a future slice.

### Wire compatibility

`DomainEvent` in `agents/shared/events.py` mirrors
`backend/shared/shared/events/schema.py` field-for-field. The contract is
the JSON wire format, not a shared Python package. If you change one side,
update the other and bump
[test_domain_event_matches_backend_wire_shape](tests/test_events.py).

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `<AGENT>_JWT_SECRET` | — | **required**; must match user_service's secret. Empty → 503 on /chat. |
| `<AGENT>_JWT_ALGORITHM` | `HS256` | JWT signing algo |
| `<AGENT>_LLM_PROVIDER` | `mock` | `mock` \| `groq` \| `openai` |
| `<AGENT>_LLM_MODEL` | provider default | override model name |
| `GROQ_API_KEY` | — | required if `LLM_PROVIDER=groq` |
| `OPENAI_API_KEY` | — | required if `LLM_PROVIDER=openai` |
| `OPENAI_BASE_URL` | — | set for Azure OpenAI |
| `EMBEDDING_PROVIDER` | `mock` | `mock` \| `local` \| `openai` |
| `QDRANT_URL` | — | unset → memory disabled |
| `QDRANT_API_KEY` | — | optional |
| `MEMORY_DISABLED` | `false` | force-disable memory |
| `ALLOW_EXTERNAL_PHI_EMBEDDING` | `false` | guard for external embedders + PHI |
| `SMART_RECOMMEND_AMQP_URL` | — | unset → event subscriber disabled |
| `SMART_RECOMMEND_EVENT_QUEUE` | `smart_recommend.analyze_triggers` | durable queue name |
| `SMART_RECOMMEND_EVENT_THROTTLE_SECONDS` | `300` | min interval between analyses per patient |
| `VITALS_WATCHER_AMQP_URL` | — | unset → subscriber + publisher both disabled |
| `VITALS_WATCHER_EVENT_QUEUE` | `vitals_watcher.scan_triggers` | durable queue name |
| `VITALS_WATCHER_EVENT_THROTTLE_SECONDS` | `60` | min interval between scans per patient (acute lane) |
| `VITALS_WATCHER_SCAN_HOURS_BACK` | `6` | how far back to pull vitals when scanning |
| `LAB_READER_MAX_IMAGE_BYTES` | `5242880` | hard cap on /scan decoded image size (5 MB) |
| `LAB_READER_SCAN_MAX_TOKENS` | `1500` | tokens reserved for the extraction LLM response |
| `SMART_RECOMMEND_NOTIFICATION_SERVICE_URL` | docker-compose hostname | empty → notification dispatch disabled |
| `SMART_RECOMMEND_NOTIFICATION_SUPPRESSION_SECONDS` | `21600` | per-(patient, dedup_key) suppression window (6h) |
| `VITALS_WATCHER_NOTIFICATION_SERVICE_URL` | docker-compose hostname | empty → notification dispatch disabled |
| `VITALS_WATCHER_NOTIFICATION_SUPPRESSION_SECONDS` | `21600` | per-(patient, dedup_key) suppression window (6h) |
| `ENV` | — | `production` blocks non-BAA providers |

## Running tests

From the repo root (relies on PEP 420 namespace packages — no
`agents/__init__.py`):

```powershell
$env:PYTHONPATH = "."
.venv\Scripts\python.exe -m pytest agents/tests
```

For service-level smoke tests:

```powershell
$env:PYTHONPATH = ".;agents/services/concierge_agent"
.venv\Scripts\python.exe -m pytest agents/services/concierge_agent/tests
```

Tests use `InMemoryQdrant` and `MockEmbedding` — no Qdrant or LLM keys
required. The OpenAI-compat provider test skips cleanly when the `openai`
SDK isn't installed.
