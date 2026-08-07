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

## Daily figures — PO ruling 2026-08-07

The screens present step counts and sleep as daily figures; the contract has no notion of "today's
steps". **The PO ruled: readings are CUMULATIVE — take the latest per device per day.**

Implemented as `src/features/wearables/daily.ts`, a pure function with 11 tests, rather than inline
arithmetic in a screen. It is the one calculation in this feature that can be silently wrong: a
client that SUMS three cumulative snapshots reports 6,240 steps for a watch that walked 1,940, and
the number looks entirely normal.

Rules encoded, each with a test:
- **Latest by TIMESTAMP**, not by array position — samples can sync late and arrive out of order.
- **Local calendar day**, not UTC. A count that resets at the wrong hour is visible to the patient.
- **Non-numeric values are SKIPPED, not coerced.** `Number("122/80")` is `NaN`; a blood-pressure
  reading must not corrupt a step total.
- **No readings returns null, not zero.** Zero steps claims the patient did not move; no data does
  not.

**Still ambiguous, and surfaced rather than guessed:** "latest per device" then summed is right for
a watch plus a scale, and WRONG for two devices both counting steps — a phone and a watch would
double the total. `deviceCount` is returned so a caller can warn. Today the seeded data has one
device; this needs a decision if that changes.

`LifestyleHubScreen` is still not wired — the aggregation it needed now exists, so that is a
mechanical next step rather than a blocked one.
