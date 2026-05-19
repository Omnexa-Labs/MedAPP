# MedApp — Project Handbook

> The single document anyone joining the project should read first. After this
> you'll know what we're building, why, how it's structured, and where to look
> next.

---

## 1. Vision & Mission

**Vision:** MedApp is a mobile-first, AI-assisted healthcare infrastructure that gives every user in emerging markets a lifelong, portable health identity and connects that identity to the providers, data, and workflows that make care continuous.

**Mission:** Build the user-owned health layer that stays present before, during, and after care by connecting records, providers, labs, pharmacies, telemedicine, reminders, and AI guidance into one continuous system.

MedApp is a user-first healthcare platform. We use the word user intentionally: a user is anyone with a body and a phone, whether they are healthy, worried, recovering, or actively receiving care. A patient is a state a user passes through, not their identity.

The product targets emerging markets first — Ghana, Nigeria, Kenya, and similar contexts — where healthcare is episodic when it should be continuous, and fragmented when it should be portable. Our job is not to replace clinicians. Our job is to make the infrastructure around clinicians continuous, user-owned, and mobile-first.

We are trying to:

- Give every user a **lifelong portable record** they can carry across providers and countries.
- Help users **prepare for care** with summaries, trends, reminders, and plain-language explanations.
- Help users **follow through** after care with prescriptions, lab results, follow-ups, and nudges.
- Give providers a **shared context layer** so each encounter starts from the user's actual history, not from zero.

Success looks like a user in Kumasi who can open MedApp, share their complete health story in under 30 seconds, consult a clinician who already sees the right context, receive a prescription or lab order that flows back into the record, and get only the nudges that matter.

---

## 2. Audience & roles

| Role | Primary surface | Examples |
|---|---|---|
| **User** | Mobile app | Uses the role-based app for booking, concierge chat, records, and follow-up |
| **Doctor** | Mobile app + web (later) | Manages availability, runs telemedicine sessions, writes prescriptions |
| **Nurse** | Mobile app | Accepts home-visit bookings, records vitals |
| **Hospital admin** | Admin web console | Manages doctors, facilities, pricing, KYC |
| **Platform admin (us)** | Admin web console | KYC review, disputes, content moderation, analytics |

The mobile app is the same binary for all role types — the role is on the user record and the UI adapts.

---

## 3. Product surface (what we build)

### 3.1 User-owned health identity
- A lifelong, portable record for every user: conditions, medications, allergies, immunizations, lab history, vitals trends, consultations, and prescriptions.
- Exportable, shareable, and consent-driven across providers and borders.
- The foundation for every other workflow in the platform.

### 3.2 Care coordination
- Booking for doctors, nurses, hospitals, and future partner workflows.
- Telemedicine that is tied to the user's record before and after the call.
- Lab orders, results, and follow-up actions that flow back into the same record.

### 3.3 Provider network
- Search and discovery for doctors, nurses, hospitals, and future partner types.
- Profiles with availability, specialty, accreditation, pricing, and other decision-making context.
- Hospital teams and practitioner affiliations supported through partner onboarding.

### 3.4 AI health companion
| Capability | What it does |
|---|---|
| **Concierge** | The user-facing entry point that routes intent and coordinates the other capabilities. |
| **Medical Chat** | Conversational intake and triage; it prepares the user, but does not diagnose. |
| **Lab Reader** | Explains uploaded labs and prescriptions in plain language. |
| **Vitals Watcher** | Monitors wearable and biometric trends, not isolated readings. |
| **Care Timeline** | Maintains the longitudinal story of what has happened to the user. |
| **Medication Agent** | Tracks adherence, reminders, and refill nudges. |
| **Booking Agent** | Finds the right provider and coordinates the appointment. |
| **Smart Recommend** | Low-frequency preventive guidance based on the user's actual data. |

The agents call MedApp backend services as tools. They are not a separate product surface; they are an orchestration layer that helps the user understand, prepare, track, and follow through.

### 3.5 Platform workflows
- Notifications, reminders, and nudges with a high bar for usefulness.
- Reviews, comments, Q&A, and other trust-building social surfaces.
- Analytics and reporting for platform admins and operations teams.

### 3.6 Out of scope for now
- Pharmacy fulfilment as a business.
- Insurance claims processing.
- Clinical decision support.
- Wearable hardware manufacturing.
---

## 4. Architecture

### 4.1 The picture
```
┌──────────────────────────────┐         ┌──────────────────────────────┐
│   Mobile (Flutter)           │         │   Admin Web (Next.js, later) │
└──────────────┬───────────────┘         └─────────────┬────────────────┘
         │                                       │
         └────────────┬──────────────────────────┘
              │ HTTPS
          ┌─────────▼─────────┐
          │   API Gateway     │  JWT verify · rate-limit · routing
          └─────────┬─────────┘
     ┌────────────────────┼────────────────────┐
     │                    │                    │
  15 backend           6 AI agents        Cross-cutting
  services           (FastAPI + LLM)
   (FastAPI)
```

### 4.2 Repository layout

```
backend/                FastAPI microservices + shared libs (Python)
  shared/               JWT, DB, events, observability, schemas
  services/             15 services, one DB per service
    api_gateway/        Edge: auth, routing, rate-limit
    user_service/       Auth, profiles, KYC (FULLY WIRED)
    doctor_service/     Doctor profiles + availability (scaffolded)
    nurse_service/      Nurse profiles + booking (scaffolded)
    hospital_service/   Hospitals, facilities, ratings (scaffolded)
    booking_service/    Unified booking engine (scaffolded)
    payment_service/    Stripe, PayPal, M-Pesa (scaffolded)
    telemedicine_service/  WebRTC rooms + tokens (scaffolded)
    notification_service/  Push, SMS, email (scaffolded)
    inbox_service/      Persistent chat, support handoff, read state (scaffolded)
    lab_service/        Lab uploads + partner labs (scaffolded)
    ehr_service/        Documents, vitals, records (scaffolded)
    social_service/     Feed, posts, Q&A (scaffolded)
    analytics_service/  Metrics, reporting (scaffolded)
    onboarding_service/ Partner onboarding for hospitals, practitioners, pharmacies

agents/                 LLM-driven agents (Python, provider TBD)
  shared/llm.py         LLMProvider abstraction + MockLLM
  prompts/              Markdown system prompts, one per agent
  services/             6 agents — concierge wired, others stubbed
    concierge_agent/    Ports 9001
    smart_recommend_agent/  9002
    medical_chat_agent/     9003
    lab_reader_agent/       9004
    vitals_watcher_agent/   9005
    booking_agent/          9006

frontend/
  mobile/               Flutter app (RUNNABLE — Android/iOS/web scaffolded)
  admin_web/            Next.js console (placeholder)

infra/
  terraform/            GCP IaC: VPC, GKE, Cloud SQL, GCS, Secrets
  k8s/                  Kustomize base + dev/staging/prod overlays
  helm/medapp/          Helm umbrella chart
  docker/               docker-compose for full local stack

ci/.github/workflows/   GitHub Actions: backend-ci, agents-ci, flutter-ci, terraform-plan, deploy
docs/                   Architecture overview, ADRs, runbooks, this handbook
packages/               OpenAPI specs + generated Dart/TS clients
scripts/                Codegen, migrations, seeds
```

### 4.3 Backend principles

- **Microservices from day one** (ADR 0001). One Postgres DB per service. No cross-service joins.
- **Polyglot persistence:** Postgres for relational, MongoDB for documents, Qdrant for vectors. A given service uses whichever combination it needs.
- **Sync calls**: HTTP via `httpx` clients in `backend/shared/clients/`.
- **Async calls**: RabbitMQ topic exchange, CloudEvents envelope (`backend/shared/events/`).
- **Auth**: JWT issued by `user_service`, verified at the gateway, re-verified per service for defense in depth.
- **Per-service Alembic migrations** for Postgres (orchestrated by `scripts/migrate-all.sh`). Mongo collections are schema-on-read.

#### Data architecture (which store for what)

| Datastore | Driver | Used for |
|---|---|---|
| **PostgreSQL 16** | `asyncpg` (runtime) + `psycopg2` (Alembic / scripts) via SQLAlchemy 2.x | All transactional/relational data: users, doctors, bookings, payments, audit logs |
| **MongoDB 7** | `motor` (async) | Chat transcripts, EHR document metadata + extracted text, social feed posts, agent traces |
| **Qdrant 1.11** | `qdrant-client` (async via REST/gRPC) | Embeddings: EHR retrieval, lab text search, medical knowledge base, long-term agent memory |

### 4.4 Agentic layer principles

- **Provider-agnostic.** No vendor SDK imports anywhere by default. The `LLMProvider` interface in `agents/shared/llm.py` defines `ToolSpec`, `ChatTurn`, `LLMResult`. Switching providers later = ~30 lines in one file.
- **Default provider is `MockLLM`** (deterministic, no key, no network). Dev and CI run with this.
- **Tools are HTTP wrappers** around internal MedApp services. Each tool gets `user_id`, forwarded as `X-User-Id` for row-level access control.
- **Agents are stateless.** Conversation state lives in `ehr_service` / `user_service`.
- **PHI never goes to logs/traces.** Use `agents/shared/phi.py::redact()` before binding anything.

### 4.5 Data residency & compliance

- HIPAA, GDPR, NDPR (Nigeria), Data Protection Act 2012 (Ghana).
- Encryption at rest (AES-256 via Cloud SQL + GCS).
- TLS 1.2+ in transit.
- Per-row audit log on PHI access (`ehr_service`).
- Regional deployment (EU by default; ZA / GH options via Terraform module replication when expanding).

### 4.6 Non-functional targets

- P95 API latency < 300 ms (user-facing endpoints)
- 99.9% availability for booking + telemedicine
- Video call latency < 150 ms (via Twilio/Daily; we don't run our own STUN/TURN)
- Scale to 5M registered users / 100k DAU before re-architecting

---

## 5. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Mobile | Flutter 3.24+ (Dart) | Single codebase for iOS/Android/web |
| Backend | FastAPI (Python 3.12) | Team familiarity, async, OpenAPI for free |
| Agents | FastAPI + provider-agnostic LLM | Same stack as backend; provider deferred |
| State (mobile) | Riverpod 2.x | Composable, testable, type-safe |
| HTTP (mobile) | Dio | Interceptors, error handling, retry |
| Relational DB | PostgreSQL 16 (SQLAlchemy 2.x async + asyncpg, sync via psycopg2) | Per-service relational store |
| Document DB | MongoDB 7 (motor async driver) | Unstructured / semi-structured data (chat transcripts, EHR document metadata, social feed) |
| Vector DB | Qdrant 1.11 | Embeddings for RAG (EHR, labs, knowledge base, agent memory) |
| Migrations | Alembic | Postgres schema migrations (per service); Mongo is schema-on-read |
| Cache | Redis 7 | Sessions, rate limits, WebRTC presence |
| Queue | RabbitMQ | Topic exchange for event bus |
| Object storage | GCS | We're on GCP |
| Cloud | GCP (GKE + Cloud SQL) | Decision in ADR 0001; team familiarity |
| IaC | Terraform | Standard |
| Container orchestration | Kubernetes (GKE) | We need autoscaling per service |
| Observability | OpenTelemetry → Jaeger + Prometheus + Grafana | Vendor-neutral |
| Error tracking | Sentry | |
| CI/CD | GitHub Actions | Repo is on GitHub |

---

## 6. How to work in this repo

### 6.1 First-time setup

```bash
# Prereqs (each is a one-time install)
#   Python 3.12 + uv  (https://github.com/astral-sh/uv)
#   Node 20 + pnpm
#   Flutter 3.24+ stable
#   Docker Desktop (WSL2 backend on Windows)
#   gcloud SDK (only for cloud work)

git clone https://github.com/Omnexa-Labs/MedAPP.git
cd MedAPP

cp .env.example .env       # leave ANTHROPIC_API_KEY blank — we use MockLLM
make dev                   # boots Postgres, Redis, RabbitMQ, and backend services
make migrate               # apply Alembic migrations per backend service
make dev-all               # optional: include the Claude agents later
make seed                  # load fixtures
```

Open:
- API gateway: http://localhost:8000
- RabbitMQ UI: http://localhost:15672 (medapp / medapp)
- Each service `/healthz`: http://localhost:80XX/healthz / http://localhost:90XX/healthz

### 6.2 Running just the mobile app (no backend)

```bash
cd frontend/mobile
flutter pub get
flutter run
```

The mobile app ships with `USE_MOCK_API=true` by default — it serves canned data so the frontend team can develop without booting anything else. See `frontend/mobile/README.md` and `docs/FRONTEND.md`.

### 6.3 Running a single backend service

```bash
cd backend/services/user_service
uv sync
uv run uvicorn app.main:app --reload --port 8001
```

### 6.4 Running a single agent

```bash
cd agents/services/concierge_agent
uv sync
uv run uvicorn app.main:app --reload --port 9001
```

By default the agent uses `MockLLM` — no API key needed. To switch providers later, see `agents/shared/llm.py`.

### 6.5 Tests

```bash
# Backend
make test                       # all services

# A single service
cd backend/services/user_service && pytest -q

# Agents
cd agents && pytest -q

# Mobile
cd frontend/mobile && flutter test
```

### 6.6 Linting & formatting

```bash
make fmt    # ruff format Python + dart format
make lint   # ruff check + flutter analyze
```

---

## 7. Service catalogue (cheat sheet)

### Backend (`backend/services/`)

| Service | Port | Status | Owns |
|---|---|---|---|
| api_gateway | 8000 | scaffold | routing, rate-limit, edge JWT verify |
| user_service | 8001 | **wired** | accounts, JWT, profiles |
| doctor_service | 8002 | scaffold | doctor profiles, availability |
| nurse_service | 8003 | scaffold | nurse profiles |
| hospital_service | 8004 | scaffold | hospitals, facilities |
| booking_service | 8005 | scaffold | unified booking engine |
| payment_service | 8006 | scaffold | Stripe, M-Pesa, PayPal |
| telemedicine_service | 8007 | scaffold | WebRTC rooms |
| notification_service | 8008 | scaffold | push, SMS, email |
| inbox_service | 8013 | scaffold | persistent chat, support handoff |
| lab_service | 8009 | scaffold | lab uploads, partner labs |
| ehr_service | 8010 | scaffold | records, documents, vitals |
| wearable_sync_service | 8014 | scaffold | wearable ingestion, EHR sync |
| social_service | 8011 | scaffold | feed, posts, Q&A |
| analytics_service | 8012 | scaffold | metrics, reporting |

### Agents (`agents/services/`)

| Agent | Port | Status |
|---|---|---|
| concierge_agent | 9001 | **wired** (5 tools, real prompt) |
| smart_recommend_agent | 9002 | scaffold |
| medical_chat_agent | 9003 | scaffold |
| lab_reader_agent | 9004 | scaffold |
| vitals_watcher_agent | 9005 | scaffold |
| booking_agent | 9006 | scaffold |

---

## 8. Implementation roadmap

We are **Phase 0**: scaffolding complete, one reference service + one reference agent fully wired.

### Phase 1 — MVP (8–12 weeks)
Goal: book a doctor → join telemedicine → leave with a record.

- [ ] Flesh out user_service registration flows (phone OTP, social login)
- [ ] Implement doctor_service availability + search filters
- [ ] Implement booking_service end-to-end (create / cancel / reschedule)
- [ ] Implement inbox_service for support handoff and patient chat
- [ ] Implement payment_service (Stripe + M-Pesa MVP)
- [ ] Implement ehr_service document upload + retrieval (GCS-backed)
- [ ] Wire telemedicine_service to Twilio / Daily
- [ ] Mobile: auth, search, booking, telemed, profile screens (real backend mode)
- [ ] LLM provider chosen → concierge agent live in staging
- [ ] Deploy to GKE staging with Helm

### Phase 2 — Marketplace depth (8 weeks)
- [ ] Reviews & ratings
- [ ] Nurse booking (home visits)
- [ ] Hospital admin web console v1
- [ ] Smart Recommend + Medical Chat agents in staging
- [ ] Multilingual support (EN, FR, TWI, SW)

### Phase 3 — Clinical depth (12 weeks)
- [ ] Lab Reader agent + OCR pipeline
- [x] Vitals Watcher + wearable sync (Apple Health, Google Fit, Fitbit)
- [ ] Insurance integration (one partner)
- [ ] Multi-region GCP deployment (EU + ZA)

### Phase 4 — Scale & polish
- [ ] Performance tuning at 100k DAU
- [ ] HIPAA SOC 2 readiness
- [ ] Doctor mobile workflows (separate from user UX)

---

## 9. Decisions & ADRs

The repo keeps lightweight [Architecture Decision Records](adr/). Read these before proposing changes to load-bearing pieces:

- [ADR 0001 — Microservices from day 1](adr/0001-microservices-from-day-1.md)
- [ADR 0002 — LLM provider deferred](adr/0002-llm-provider-deferred.md)

Open ADRs use the template in `adr/template.md`.

---

## 10. Where to look next

| If you want to… | Go here |
|---|---|
| Run the mobile app | `frontend/mobile/README.md` and [docs/FRONTEND.md](FRONTEND.md) |
| Understand the architecture in detail | [docs/architecture/overview.md](architecture/overview.md) |
| Write a new backend service | `backend/README.md` + read `user_service` as a template |
| Write a new agent | `agents/README.md` + read `concierge_agent` as a template |
| Deploy to GCP | `docs/runbooks/deploy.md` and `infra/terraform/README.md` |
| Set up locally | `docs/runbooks/local-dev.md` |
| Add a new feature | Find the matching service's README → start there |

---

## 11. Conventions

- **Branches**: trunk-based. Feature branches off `main`, merge via PR.
- **Commits**: present tense, imperative ("add X" not "added X"). One logical change per commit. PRs squash on merge.
- **PRs**: must pass CI. Include test plan. Link the ADR if architecture changes.
- **Secrets**: never in code. Local: `.env` (gitignored). Prod: GCP Secret Manager.
- **API style**: REST + JSON. OpenAPI generated per service. Versioned `/v1`.
- **PHI**: never in logs. Redact via `agents/shared/phi.py` or `backend/shared/observability/logging.py`.
