# Pharmacy Management System — Handover Guide

This guide is for an IT person setting up the **Pharmacy Management System
(PMS)** for a single pharmacy. The PMS is a self-contained template: it runs
fully standalone (POS, inventory, batches, suppliers, purchase orders,
prescriptions, dispense, reports) and optionally integrates with the MedApp
platform.

- Backend service: `backend/services/pms_service` — FastAPI on **port 8030**
- Frontend: `frontend/pms_web` — Next.js on **port 3002**
- Database: one Postgres DB per pharmacy deployment

---

## What you need

- Docker & Docker Compose (recommended), or:
  - Python 3.12 + [uv](https://docs.astral.sh/uv/)
  - Node 20+
  - Postgres 16

---

## Option A — Docker (recommended)

From the repo root:

```bash
make pms-dev
```

This brings up `postgres`, `pms_service` (8030), and `pms_web` (3002).

After the containers are up, run the migration + seed inside the service
container:

```bash
docker compose -f infra/docker/docker-compose.yml exec pms_service \
    alembic upgrade head
docker compose -f infra/docker/docker-compose.yml exec pms_service \
    python -m app.seed
```

Open http://localhost:3002 and log in:

- Email: `admin@pharmacy.local`
- Password: `ChangeMe!123`

**Change this password immediately** from the staff page.

---

## Option B — Local (no Docker)

### Backend

```bash
cd backend/services/pms_service
uv sync
cp .env.example .env             # edit values for this pharmacy
createdb medapp_pms              # or via psql
uv run alembic upgrade head
uv run python -m app.seed
uv run uvicorn app.main:app --reload --port 8030
```

Verify: `curl http://localhost:8030/healthz` should return
`{"status":"ok","service":"pms_service"}`.

### Frontend

In a second terminal:

```bash
cd frontend/pms_web
npm install
cp .env.example .env.local       # NEXT_PUBLIC_PMS_API_URL=http://localhost:8030
npm run dev
```

Open http://localhost:3002.

---

## First-day checklist for the pharmacy

1. Log in as the seeded admin, **change the password**.
2. **Staff** → add the pharmacist(s) and cashier(s) with their own logins.
3. **Suppliers** → add the wholesalers you buy from.
4. **Inventory** → add the drugs you stock (or accept the seeded sample list and edit).
5. **Purchase orders** → create your first PO and mark it Received — this
   creates batches and seeds opening stock.
6. **POS** → ring up a test sale to verify the flow.
7. **Reports** → confirm the dashboard reflects the test sale.

---

## MedApp integration (optional)

Only relevant if this pharmacy is a MedApp partner. Set these env vars on
`pms_service` and restart:

| Variable | Purpose |
|---|---|
| `PMS_MEDAPP_WEBHOOK_SECRET` | Shared secret. MedApp signs inbound prescription webhooks with HMAC-SHA256; we verify using this. |
| `PMS_MEDAPP_DISPENSE_WEBHOOK_URL` | If set, dispenses against `source=medapp` prescriptions POST a signed confirmation here. |

Endpoints exposed:

- `POST /v1/integrations/medapp/prescriptions` — MedApp calls this with
  prescription payloads. Requires `x-medapp-signature: sha256=<hmac>`.
- `GET /v1/integrations/medapp/stock-availability?drug_name=...` — Returns
  current stock so MedApp can route to the nearest in-stock pharmacy.
  Requires Bearer auth.

If both variables are empty, the PMS runs **fully standalone** with no MedApp
calls.

---

## Backup & restore

The only stateful component is Postgres. Daily backup:

```bash
docker compose -f infra/docker/docker-compose.yml exec postgres \
    pg_dump -U medapp medapp_pms > backup-$(date +%F).sql
```

Restore:

```bash
docker compose -f infra/docker/docker-compose.yml exec -T postgres \
    psql -U medapp medapp_pms < backup-2026-05-20.sql
```

---

## Upgrading

```bash
git pull
make pms-migrate       # apply new Alembic revisions
docker compose -f infra/docker/docker-compose.yml up -d --build pms_service pms_web
```

---

## Troubleshooting

- **Login fails with "invalid credentials"** — the seed ran on a different
  database than the service is pointing at. Confirm `PMS_DATABASE_URL` then
  re-seed.
- **`/healthz` returns 503** — Postgres is not ready. Check
  `docker compose logs postgres`.
- **Webhook returns 401** — `x-medapp-signature` is missing or doesn't match.
  Confirm `PMS_MEDAPP_WEBHOOK_SECRET` on both sides.
- **Stock not deducting on dispense** — confirm batches exist for that drug
  with `quantity_on_hand > 0` and `expiry_date` in the future.

---

## Useful Makefile targets

| Target | What it does |
|---|---|
| `make pms-dev` | Boot `pms_service` + `pms_web` via compose |
| `make pms-migrate` | Apply Alembic migrations |
| `make pms-seed` | Seed admin staff, drugs, supplier |
| `make pms-test` | Run the backend test suite |
| `make pms-web` | Run the frontend in dev mode |
