# Pharmacy Management System — Handover Guide

**MedApp activation update, 2026-09-16:** use the
[pharmacy activation contract](api/pharmacy_service.md) for approved MedApp
pharmacies. It requires a fresh PMS database, a permanent operator assignment,
separate credentials and `PMS_DEV_MODE=false`. The owner uses a verified MedApp
identity; do not seed shared demonstration accounts into that workspace. The
portal now supports MedApp password/MFA sign-in and server-held sessions. Use the
[portal setup guide](../frontend/pms_web/README.md) for the required private Redis,
gateway/PMS origins and exact deployment key. MedApp workspace selection and
handoff/return are implemented; configure the per-deployment handoff credential
and return allowlists before use. The owner profile editor, explicit publication/
withdrawal, history and managed photo uploads are implemented; apply directory
migration 20260916_0005 and set PHARMACY_PUBLIC_API_ORIGIN to the patient gateway.
Dashboard, catalog editing and batch receipt/adjustment/history are implemented.
Apply PMS migrations through `0007_medapp_delivery` with the updated portal/API and
follow the [inventory contract](api/pms_service.md) for versioned edits, request
keys and stock concurrency. Purchasing now supports draft edits, partial deliveries,
multiple batches, cancellation of unreceived stock and administrator reconciliation
of recorded earlier batches. POS and dispensing now review batch prices and retain
atomic request receipts; cancellation/void actions require saved revisions and
record reasons. Payment details are recorded without charging or refunding an
instrument. Receipt corrections now preserve original receipts and distinguish
never-collected units from customer returns. Only never-collected units restore
stock and reduce verified prescription quantities. External refunds can be recorded
against credits, with separate history and corrected-entry evidence. Older dispense
links require administrator review. See the [correction contract](api/pms_service.md#receipt-corrections-and-completed-refund-records).
Dispensing/correction reports now use a transactional queue and a separate worker;
follow [MedApp synchronization setup](PHARMACY_SYNC.md) and check the latest delivery
status on the prescription. Missing legacy evidence, specialist issuing, actual payment-provider
refunds, full operational and rendered/device acceptance remain pending.
The standalone instructions below do not activate MedApp ownership. Existing PMS
sessions must sign in again for the new token issuer/audience and pharmacy scope.

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
  - Node 24
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
cp .env.example .env.local       # configure PMS_WEB_* server-only values
npm run dev
```

Open http://127.0.0.1:3002. Redis is required for portal sessions. Approved owners
choose MedApp account; standalone staff choose Local staff account. The native
handoff and profile/publication workflow are not covered by these instructions.

---

## First-day checklist for the pharmacy

1. Log in as the seeded admin, **change the password**.
2. **Staff** → add the pharmacist(s) and cashier(s) with their own logins.
3. **Suppliers** → add the wholesalers you buy from.
4. **Inventory** → add the drugs you stock (or accept the seeded sample list and edit).
5. **Purchase orders** → save an order, mark it ordered after placing it with the
   supplier, then record actual deliveries and their batch details. Use direct
   batch receipt for opening stock that has no purchase-order record.
6. In a test environment, **POS** → add a non-prescription medicine, review batch
   prices, record payment details and open the saved receipt. Test a partial
   prescription dispense and check its remaining quantities and linked sale.
7. **Reports** → confirm the dashboard reflects recorded transactions. A lost
   response should be retried using **Retry same request** in the same open form.
   Do not recreate an uncertain sale without checking the ledger.

---

## MedApp integration (optional)

Only relevant if this pharmacy is a MedApp partner. Set these env vars on
`pms_service` and restart:

| Variable | Purpose |
|---|---|
| `PMS_MEDAPP_WEBHOOK_SECRET` | Shared secret. MedApp signs inbound prescription webhooks with HMAC-SHA256; we verify using this. |
| `PMS_MEDAPP_SYNC_URL` | Exact `/v1/pharmacy-sync/events` receiver URL used by the separate durable delivery worker. The old dispense callback setting is retired. |
| `PMS_MEDAPP_DEPLOYMENT_KEY` | Permanent deployment assignment, shared with the directory and worker. |

Endpoints exposed:

- `POST /v1/integrations/medapp/prescriptions` — MedApp calls this with
  prescription payloads. Requires `x-medapp-signature: sha256=<hmac>`.
- `GET /v1/integrations/medapp/stock-availability?drug_name=...` — Returns
  current stock so MedApp can route to the nearest in-stock pharmacy.
  Requires Bearer auth.

Standalone walk-in/internal prescriptions do not enter the delivery queue. A
MedApp-origin prescription without verified patient/workspace identity remains
flagged for records review. See [the worker rollout and recovery guide](PHARMACY_SYNC.md)
before enabling delivery; this also requires the confirmed MedApp deployment and
the directory's matching per-deployment credential.

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
