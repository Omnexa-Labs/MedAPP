# API contract — `hms_service`

**Public prefix:** `/v1/hms/*` (namespaced by the gateway; upstream sees `/v1/*`)
· **Client:** none yet — see "What still blocks it".

> 51 routes. No client written. Two blockers cleared 2026-08-07, one remains and it is a product
> decision.

## Blocker 1 — CLEARED: the container was attached to no network

`hms_service` reported `failed to resolve host 'postgres'` even with postgres up and healthy.

The cause was not configuration. Compose resolved `networks` correctly and `HostConfig.NetworkMode`
read `medapp_default`, but `docker inspect .NetworkSettings.Networks` was **empty** — the container
was running and attached to nothing. A stale container from an earlier failed start (it first died
on the 8020 port collision) was being reused by `up -d` without ever being reattached.

**`docker compose rm -sf hms_service` then `up -d` fixed it.** DNS now resolves
(`postgres -> 172.24.0.2`) and `alembic upgrade head` applied `20260520_0001 Initial tenant schema`
— this service had no tables at all before today.

Worth knowing generally: **a healthcheck can pass while the container is unreachable.** This one
polls `127.0.0.1/healthz`, so Docker reported it healthy the whole time it could not see the
database. A healthcheck that never leaves the container proves only that the process is alive.

## Blocker 2 — CLEARED: no gateway route

Covered in `docs/api/README.md`. `/v1/hms/*` is namespaced because `hms_service` mounts at bare
`/v1` and would otherwise swallow every unmatched path.

## What still blocks it — TENANT IDENTITY

Every route now answers `400 {"detail":"missing tenant context"}` rather than 500. That is the
service working correctly and saying what it needs.

`middleware.py` sets the tenant from a **`hospital_id` claim in the JWT**. A MedApp patient or
doctor token has no such claim, so the context is never set. HMS expects tokens minted for HOSPITAL
STAFF, scoped to one hospital, issued by its own dev auth router or a staff login.

This is the same shape as `pms_service`: **a separate identity system, not a role branch.** Wiring
any HMS screen means deciding how a MedApp session becomes an HMS staff session — token exchange, a
second login, or a `hospital_id` claim added at issue time for users with a verified staff role.
That is an architecture and product decision, not a wiring task.

Note the related open security item in `docs/api/user_service.md`: `hospital_admin` is currently
self-assignable via KYC `target_role` and is **global rather than per-tenant**. Any answer here
should close that at the same time, or a self-assigned admin would gain access across hospitals.

## Multi-tenancy shape

`HMS_TENANT_DATABASE_URL_TEMPLATE` is `postgresql+asyncpg://…/hms_{tenant_slug}` — **a database per
tenant**, not a tenant column. So tenant isolation is physical, which is strong, but it also means
provisioning a hospital creates a database and runs migrations against it. There is no evidence any
tenant database has ever been created.

`HMS_DEV_MODE` skips staff-membership verification and `main.py` refuses to boot with it in
production — worth preserving.
