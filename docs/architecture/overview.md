# Architecture overview

```
                          ┌─────────────────────────┐
                          │      Mobile (Flutter)   │
                          └────────────┬────────────┘
                                       │ HTTPS
                                ┌──────▼───────┐
                                │  API Gateway │  (JWT verify, rate-limit, routing)
                                └──────┬───────┘
                  ┌────────────────────┼─────────────────────┐
                  │                    │                     │
        ┌─────────▼──────┐  ┌──────────▼──────┐   ┌──────────▼──────┐
        │  user_service  │  │ doctor_service  │   │ hospital_service│   …13 svcs
        └─────────┬──────┘  └──────────┬──────┘   └──────────┬──────┘
                  │                    │                     │
                  └────────► Cloud SQL Postgres ◄─────────────┘
                                       │
                                ┌──────▼──────┐
                                │  RabbitMQ   │  (event bus, topic exchange)
                                └──────┬──────┘
                                       │
                ┌──────────────────────┼─────────────────────┐
                │                      │                     │
        ┌───────▼────────┐    ┌────────▼────────┐    ┌───────▼─────────┐
        │ notif_service  │    │ analytics_svc   │    │ Agents (Claude) │
        └────────────────┘    └─────────────────┘    └─────────────────┘
                                                              │
                                              ┌───────────────┴───────────────┐
                                              │  concierge ◄──┐               │
                                              │  recommend    ├ each calls   ▼
                                              │  chat         │  backend services
                                              │  lab          │  as tools (HTTP)
                                              │  vitals       │
                                              │  booking ◄────┘
                                              └───────────────────────────────┘
```

## Agentic layer

Agents are FastAPI services that wrap Claude Opus 4.7 with the Anthropic SDK's beta tool runner. They don't host models — they orchestrate Claude with our microservices exposed as tools.

- One agent per persona (concierge, recommend, chat, lab, vitals, booking). The concierge agent can delegate to sub-agents via HTTP.
- System prompts are frozen and `cache_control: ephemeral` — caching cuts cost ~90% on repeat turns.
- PHI never leaves the VPC: Anthropic API calls go out under our BAA; logs and traces are redacted via `agents/shared/phi.py`.

## Key decisions

- **Per-service database** (own schema; no cross-service joins). Communicate via events or APIs only.
- **Event bus**: RabbitMQ topic exchange, CloudEvents envelope (`shared/events/schema.py`).
- **Auth**: JWT issued by `user_service`, verified at the gateway and re-verified per service.
- **Storage**: Cloud SQL/Postgres for transactional state; GCS for binaries; MongoDB for narrative text and traces; Qdrant for retrieval; Redis for cache and short-lived state; RabbitMQ plus outbox for cross-service sync.
- **Observability**: OpenTelemetry → OTLP collector → Jaeger + Prometheus. Structured JSON logs.
- **Frontend**: Flutter (mobile) + Next.js (internal admin only).
- **ML**: separate workspace, GPU node pool, MLflow registry. Inference is FastAPI services behind the gateway.

See [storage architecture](storage.md) for the service ownership map and agent read-model guidance.

## Storage model

The storage layer is intentionally polyglot, but each store has a narrow job:

- **PostgreSQL** is the system of record for service-owned transactional data and clinical metadata.
- **GCS** stores the large binary payloads that should not live in rows: lab PDFs, scans, exports, attachments.
- **MongoDB** stores high-volume narrative and semi-structured content: chat transcripts, evolving document metadata, agent traces.
- **Qdrant** stores embeddings for retrieval surfaces used by agents and document search.
- **Redis** stores ephemeral state only: sessions, locks, rate limits, and short-lived caches.
- **RabbitMQ** carries domain events; the outbox pattern keeps event publication consistent with local writes.

The rule of thumb is: write once to the owning service, then materialize whatever read surfaces agents need on top of that source of truth.

## Compliance

- HIPAA / GDPR / NDPR boundaries enforced at the data layer via column-level encryption for PHI and audit logs for record access.
- Data residency: regional GKE + Cloud SQL, EU region by default. Multi-region available via Terraform module replication.
