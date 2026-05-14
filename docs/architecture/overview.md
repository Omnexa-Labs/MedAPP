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
- **Storage**: GCS for documents/uploads; Cloud SQL for relational; Redis for cache + WebRTC presence.
- **Observability**: OpenTelemetry → OTLP collector → Jaeger + Prometheus. Structured JSON logs.
- **Frontend**: Flutter (mobile) + Next.js (internal admin only).
- **ML**: separate workspace, GPU node pool, MLflow registry. Inference is FastAPI services behind the gateway.

## Compliance

- HIPAA / GDPR / NDPR boundaries enforced at the data layer via column-level encryption for PHI and audit logs for record access.
- Data residency: regional GKE + Cloud SQL, EU region by default. Multi-region available via Terraform module replication.
