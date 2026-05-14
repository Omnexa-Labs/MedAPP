# MedApp — Project Handbook

> The single document anyone joining the project should read first. After this
> you'll know what we're building, why, how it's structured, and where to look
> next.

---

## 1. Mission

**Make high-quality healthcare reachable from a phone, anywhere.**

MedApp is a mobile-first healthcare platform connecting patients with doctors,
nurses, and hospitals — with an AI assistant in the loop for triage, scheduling,
record-keeping, and lifestyle guidance. The product targets emerging markets
first (Ghana, Nigeria, Kenya) where the gap between "I'm not feeling well" and
"I'm in front of a clinician" is widest, then expands.

We are not trying to replace clinicians. We're trying to:

- Help patients **find the right clinician** faster (search by specialty, location, rating, price, insurance).
- Help them **show up prepared** (AI-summarised symptoms, uploaded labs, medication list).
- Help them **follow through** after the visit (reminders, prescription tracking, follow-up booking).
- Give clinicians a **lightweight EHR** that travels with the patient across providers.

Success looks like: a patient in Kumasi books a cardiologist, completes a video consult, gets a prescription, has it interpreted by the AI assistant, and uploads their next lab result — all from one app, in their language.

---

## 2. Audience & roles

| Role | Primary surface | Examples |
|---|---|---|
| **Patient** | Mobile app | Books appointments, talks to AI concierge, uploads records |
| **Doctor** | Mobile app + web (later) | Manages availability, runs telemedicine sessions, writes prescriptions |
| **Nurse** | Mobile app | Accepts home-visit bookings, records vitals |
| **Hospital admin** | Admin web console | Manages doctors, facilities, pricing, KYC |
| **Platform admin (us)** | Admin web console | KYC review, disputes, content moderation, analytics |

The mobile app is the same binary for all four user types — the role is on the user record and the UI adapts.

---

## 3. Product surface (what we build)

### 3.1 Marketplace
- Search & discovery for doctors, nurses, hospitals (specialty, geo, rating, price, insurance)
- Profile pages with reviews, availability, accreditation, mortality rate (hospitals)

### 3.2 Booking
- Unified booking engine for doctor / nurse / hospital appointments
- Timezone-aware availability, waitlists, calendar integration
- Payment capture (Stripe + M-Pesa + MTN Mobile Money + PayPal)

### 3.3 Telemedicine
- WebRTC video/audio with chat and file share
- Pre-visit checklist, post-visit summary, prescription PDF

### 3.4 EHR-lite
- Patient-owned medical records: documents, vitals timeline, medications, allergies
- Consent-driven sharing with providers
- Encrypted at rest, audit logged on every access

### 3.5 AI agents (provider-not-yet-chosen)
| Agent | What it does |
|---|---|
| **Concierge** | The patient's personal assistant — orchestrates everything else |
| **Smart Recommend** | Diet, lifestyle, medication adherence from EHR + wearables |
| **Medical Chat** | Conversational symptom triage; never diagnoses, always refers |
| **Lab Reader** | Reads uploaded lab results & prescriptions (vision); explains in plain language |
| **Vitals Watcher** | Streams wearable data; alerts on anomalies |
| **Booking** | Multi-step booking sub-agent the Concierge delegates to |

The agents call MedApp backend services as tools (search providers, get EHR, create booking). They're not a separate model layer — they're an orchestration layer over an LLM that we will choose during evaluation. See ADR 0002.

### 3.6 Reviews, payments, notifications, social
Standard marketplace mechanics: ratings + textual reviews; multi-channel payments; push/SMS/email notifications; doctor blog posts and Q&A.

### 3.7 Out of scope (for now)
- Prescription delivery / pharmacy fulfilment
- Insurance claims processing
- Clinical decision support (this requires regulatory clearance we're not pursuing yet)
- Wearable hardware

---

## 4. Architecture

### 4.1 The picture

```
┌──────────────────────────────┐         ┌──────────────────────────────┐
│   Mobile (Flutter)            │         │   Admin Web (Next.js, later) │
└──────────────┬───────────────┘         └─────────────┬────────────────┘
               │                                       │
               └────────────┬──────────────────────────┘
                            │ HTTPS
                  ┌─────────▼─────────┐
                  │   API Gateway     │  JWT verify · rate-limit · routing
                  └─────────┬─────────┘
       ┌────────────────────┼────────────────────┐
       │                    │                    │
   13 backend           6 AI agents        Cross-cutting
   microservices      (FastAPI + LLM)
   (FastAPI)
```

### 4.2 Repository layout

```
backend/                FastAPI microservices + shared libs (Python)
  shared/               JWT, DB, events, observability, schemas
  services/             13 services, one DB per service
    api_gateway/        Edge: auth, routing, rate-limit
    user_service/       Auth, profiles, KYC (FULLY WIRED)
    doctor_service/     Doctor profiles + availability (scaffolded)
    nurse_service/      Nurse profiles + booking (scaffolded)
    hospital_service/   Hospitals, facilities, ratings (scaffolded)
    booking_service/    Unified booking engine (scaffolded)
    payment_service/    Stripe, PayPal, M-Pesa (scaffolded)
    telemedicine_service/  WebRTC rooms + tokens (scaffolded)
    notification_service/  Push, SMS, email (scaffolded)
    lab_service/        Lab uploads + partner labs (scaffolded)
    ehr_service/        Documents, vitals, records (scaffolded)
    social_service/     Feed, posts, Q&A (scaffolded)
    analytics_service/  Metrics, reporting (scaffolded)

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
- **Tools are HTTP wrappers** around internal MedApp services. Each tool gets `patient_id`, forwarded as `X-Patient-Id` for row-level access control.
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
make dev                   # boots Postgres, Redis, RabbitMQ, 13 services, 6 agents
make migrate               # apply Alembic migrations per service
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
| lab_service | 8009 | scaffold | lab uploads, partner labs |
| ehr_service | 8010 | scaffold | records, documents, vitals |
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
- [ ] Vitals Watcher + wearable sync (Apple Health, Google Fit, Fitbit)
- [ ] Insurance integration (one partner)
- [ ] Multi-region GCP deployment (EU + ZA)

### Phase 4 — Scale & polish
- [ ] Performance tuning at 100k DAU
- [ ] HIPAA SOC 2 readiness
- [ ] Doctor mobile workflows (separate from patient UX)

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
