# MedApp

Mobile-first global healthcare ecosystem — telemedicine, EHR-lite, AI assistant, hospital/doctor/nurse marketplace.

## Repository layout

```
backend/          FastAPI microservices + shared libs
agents/           Claude-powered FastAPI agents (concierge, recommend, chat, lab, vitals, booking)
frontend/
  mobile/         Flutter app (iOS/Android)
  admin_web/      Next.js admin console
infra/
  terraform/      GCP infrastructure as code (GKE, Cloud SQL, GCS, …)
  k8s/            Kustomize base + per-env overlays
  helm/           Helm chart for full app deployment
  docker/         Shared Dockerfile bases, docker-compose for local dev
ci/.github/       GitHub Actions workflows (reusable per workspace)
packages/
  openapi/        Canonical OpenAPI specs per service
  clients/        Generated Dart + TS clients (do not edit by hand)
docs/             ADRs, architecture diagrams, runbooks, API docs
scripts/          Dev tooling, codegen, db scripts
```

## Quick start (local dev)

```bash
# 1. Install: Docker Desktop, Python 3.12, uv, Node 20, Flutter 3.22+, gcloud SDK
# 2. Boot the backend stack (Postgres, Redis, RabbitMQ, backend services)
make dev

# 3. Run mobile app
cd frontend/mobile && flutter run
```

See `docs/runbooks/local-dev.md` for the full setup walkthrough.

## Services

| Service | Port | Purpose |
|---|---|---|
| api_gateway | 8000 | Edge auth, routing, rate limit |
| user_service | 8001 | Users, auth, KYC |
| doctor_service | 8002 | Doctor profiles + availability |
| nurse_service | 8003 | Nurse profiles + booking |
| hospital_service | 8004 | Hospitals, facilities, ratings |
| booking_service | 8005 | Unified booking engine |
| payment_service | 8006 | Stripe, PayPal, M-Pesa |
| telemedicine_service | 8007 | WebRTC rooms, tokens |
| notification_service | 8008 | Push, SMS, email, in-app |
| lab_service | 8009 | Lab uploads, OCR, partner labs |
| ehr_service | 8010 | Documents, vitals, records |
| social_service | 8011 | Feed, posts, Q&A |
| analytics_service | 8012 | Metrics, reporting |

Agentic services live under `agents/services/` (ports 9001–9006). Each is a thin FastAPI app that drives Claude Opus 4.7 via the Anthropic SDK's beta tool runner, with MedApp microservices exposed as tools.

| Agent | Port | What it does |
|---|---|---|
| concierge_agent | 9001 | Personal medical assistant — orchestrates everything |
| smart_recommend_agent | 9002 | Lifestyle / diet / medication recommendations |
| medical_chat_agent | 9003 | Symptom triage and health Q&A |
| lab_reader_agent | 9004 | Reads lab results & prescriptions (vision) |
| vitals_watcher_agent | 9005 | Wearable anomaly detection + alerts |
| booking_agent | 9006 | Multi-step booking sub-agent |

## Documentation

**Start here:**
- [**Project handbook**](docs/PROJECT.md) — mission, architecture, roadmap, how to work in this repo
- [**Frontend handbook**](docs/FRONTEND.md) — for the frontend engineer: get started, conventions, what to build

**Reference:**
- [Architecture overview](docs/architecture/overview.md)
- [API conventions](docs/api/conventions.md)
- [ADRs](docs/adr/)
- [Runbooks](docs/runbooks/)
