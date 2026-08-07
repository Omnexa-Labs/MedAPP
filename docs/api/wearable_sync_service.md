# API contract — `wearable_sync_service`

**Prefix:** `/v1/wearables` · **Client:** `frontend/mobile/MedAPP/src/features/wearables/api.ts`

> No new endpoints created. One real BUG fixed to make the service usable at all — see below.

## Routes

| Method | Path | Returns | Verified live |
| --- | --- | --- | --- |
| GET | `/v1/wearables/devices` | `WearableDeviceList` — `{items}` | **200** |
| GET | `/v1/wearables/summary` | `WearableSummaryOut` | **200** |
| GET | `/v1/wearables/devices/{id}/samples` | `WearableSampleList` | — |
| POST | `/v1/wearables/devices` | `WearableDeviceOut` | — |
| POST | `/v1/wearables/sync` | `WearableSyncResult` | — |

## MIGRATIONS HAD NEVER RUN IN DOCKER

`alembic/env.py` computed `BACKEND_DIR = BASE_DIR.parents[1]`. In the container the service lives at
`/app`, so `BASE_DIR` is `/app` and `parents[1]` raises `IndexError` before alembic starts.

The repo checkout has enough directory depth for it, so it only failed **where it actually
mattered** — this service had no tables at all in Docker. Now guarded: the shared path is added only
when that directory exists. `alembic upgrade head` applies the initial schema and both read routes
answer.

Worth checking the other services' `env.py` for the same `parents[N]` assumption; this one was found
only because the service was started.

## Gaps and hazards

- **`POST /sync` is an INGEST endpoint, not a refresh.** It takes the device AND the samples — the
  caller supplies the readings. Nothing in this product talks to Fitbit, Apple Health or any vendor
  API. A "Sync now" button wired to this would upload nothing and report success.
- **A sample can be stored and still not reach the medical record.** `synced_to_ehr`, `sync_status`,
  `sync_error` and `ehr_vital_id` describe a SECOND hop into `ehr_service` that can fail on its own.
  `synced_to_ehr === false` means a clinician looking at vitals will **not** see that reading. Any
  UI claiming "shared with your doctor" must read that flag, not merely that a sample exists.
- **`kind` is free text and `value` is a STRING**, exactly as in `ehr_service` vitals.
- **`min_length=1` on sync samples** — an empty sync is a 422, not a no-op.
- **No pagination** on devices or samples.

## Wiring status

| Screen | State |
| --- | --- |
| Client (`features/wearables/api.ts`) | Written; devices and summary verified live. |
| `LifestyleHubScreen` / lifestyle-manage | **Not wired** — screens exist, still on seed data. |

Wiring Lifestyle is a real task rather than a swap. The screens present **step counts and sleep as
first-class daily figures**, and the contract offers only free-text `kind`/`value` samples plus
totals — there is no notion of "today's steps" anywhere in it. Deciding how a sample stream becomes
a daily figure (client-side aggregation? a new server endpoint?) is a product question, and
guessing it would put invented numbers on a health screen.
