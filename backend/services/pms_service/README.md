# pms_service — Pharmacy Management System (Template)

A self-contained FastAPI backend for a single pharmacy. Designed as a
**template** that any pharmacy can deploy on its own (Docker or bare metal)
and run independently of the MedApp platform. Optionally integrates with
MedApp to receive prescriptions and report dispensings back.

- Single-tenant: one DB per pharmacy deployment.
- Port: **8030** (frontend `pms_web` runs on **3002**).
- Stack: Python 3.12, FastAPI, SQLAlchemy 2.x (async), Postgres 16, Alembic.

## Quick start (local dev)

```bash
cd backend/services/pms_service
uv sync
cp .env.example .env

# Option A — schemaless dev mode (creates tables in-process, no Alembic):
PMS_DEV_MODE=true uv run uvicorn app.main:app --reload --port 8030

# Option B — real Postgres + Alembic:
createdb medapp_pms     # or via psql / Docker
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8030
```

Then:
- API root:        http://localhost:8030/
- OpenAPI docs:    http://localhost:8030/docs
- Health check:    http://localhost:8030/healthz

## Tests

```bash
uv sync --extra test
uv run pytest -q
```

## Handover to a pharmacy

This service is intentionally a single deployable unit. For each pharmacy:

1. Provision a Postgres database (e.g. `medapp_pms_<pharmacy-slug>`).
2. Set `.env` with that pharmacy's `PMS_PHARMACY_*` identity values and a
   long random `PMS_JWT_SECRET`.
3. Run `alembic upgrade head`, then seed an admin via `POST /v1/dev/seed`
   (dev mode) or the staff CRUD endpoint.
4. Set `PMS_MEDAPP_*` values **only if** the pharmacy is becoming a MedApp
   partner — otherwise leave them empty and the service runs standalone.

See `docs/` (top-level) for the broader handover guide.
