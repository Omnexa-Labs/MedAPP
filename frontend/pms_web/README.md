# pms_web — Pharmacy Management System UI (Template)

Next.js 14 (App Router) admin UI for the `pms_service` backend. Designed as a
**template** that ships per pharmacy: clone, configure the API URL, deploy.

- Port: **3002**
- Stack: Next 14, TanStack Query, Zustand, react-hook-form + zod, axios,
  Tailwind, recharts, lucide-react.

## Quick start

```bash
cd frontend/pms_web
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_PMS_API_URL if not localhost:8030
npm run dev
```

Open http://localhost:3002 and log in with the seeded admin
(`admin@pharmacy.local` / `ChangeMe!123` — change immediately after first login).

## Production build

```bash
npm run build
npm run start
```

Or build the container with the included `Dockerfile`. The image listens on
port `3000` internally; the compose file exposes it as `3002` on the host.

## Configuration

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_PMS_API_URL` | Base URL for `pms_service` (default `http://localhost:8030`) |

## Pages

- `/dashboard` — KPIs, sales summary, stock valuation
- `/inventory` — drug catalog, low-stock alerts
- `/batches` — stock batches with FEFO expiry watch
- `/suppliers` — supplier directory
- `/purchase-orders` — create POs, receive goods → creates batches
- `/prescriptions` — Rx queue (walk-in / MedApp / internal), dispense
- `/pos` — over-the-counter walk-in sales
- `/customers` — customer directory + MedApp user linking
- `/sales` — sales ledger with void
- `/reports` — sales summary, daily series, top sellers
- `/staff` — staff management (admin only)
- `/settings` — pharmacy profile + integration info (admin only)

## Role gating

The sidebar hides admin-only links (`Staff`, `Settings`) for non-admins. The
backend enforces the real authorization — the frontend is convenience-only.
