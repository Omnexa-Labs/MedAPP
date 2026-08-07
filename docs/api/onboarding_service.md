# API contract — `onboarding_service`

**Prefix:** `/v1/onboarding` · **Client:** `frontend/mobile/MedAPP/src/features/partner/api.ts`

> No new endpoints created. One **missing container** added — see below.

## THIS SERVICE HAD NO CONTAINER

`onboarding_service` exists on disk and the gateway routes `/v1/onboarding` to
`http://onboarding_service:8013` — but it was **the only one of the twenty services with no
`docker-compose.yml` entry**. Every call failed at DNS inside the compose network, and
`docker compose up onboarding_service` answered `no such service`.

Added 2026-08-07 with `depends_on: postgres: service_healthy`, host port **8022** (`inbox_service`
already publishes 8013; sharing the *internal* port is harmless because the hostnames differ).
Both migrations then applied — the initial schema had never run — and both read routes verified.

**Worth a standing check:** compare `ls backend/services` against the compose service list. That
diff is one command and would have caught this at any point.

## Routes

| Method | Path | Returns | Verified |
| --- | --- | --- | --- |
| GET | `/v1/onboarding/applications` | `{items}` | **200** |
| GET | `/v1/onboarding/applications/{id}` | application | — |
| GET | `/v1/onboarding/summary` | counts + recent | **200** |
| POST | `/v1/onboarding/applications` | create | not wrapped |
| POST | `/applications/{id}/documents` · `/team-members` · `/submit` | — | not wrapped |
| POST | `/applications/{id}/review` | — | **admin, not wrapped** |

## Why the client is read-only

`src/store/welcome-store.ts` already records the split — *"This is NOT partner onboarding — that
lives on the web"* — and `lib/partner/open-onboarding.ts` hands off to it. The mobile app's job is
to show an applicant **where they are**, which is what `/(app)/onboarding-status` exists for.

Create, documents, team-members and submit are therefore not wrapped: document upload and
legal-entity details belong to the flow that owns them, and a half-copy on mobile would be a second
place for a partner application to diverge. **`/review` is an admin action** and must never be
reachable from a patient build.

## Gaps and hazards

- **`rejection_reason` must be shown only when the status is rejected.** A stale reason left on a
  resubmitted application would tell an approved partner they had been turned down. The client
  carries it through; the screen has to gate it.
- **`partner_type`, `onboarding_mode` and `status` are StrEnums server-side but arrive as plain
  strings.** Treated as free text, consistent with every other status field in this codebase.
- **`display_name` is nullable**; `legal_name` is not. Fall back to the legal name.
- **No pagination** on applications.

## Wiring status

| Screen | State |
| --- | --- |
| Client (`features/partner/api.ts`) | Written; applications and summary verified live at 200. |
| `/(app)/onboarding-status` | **Not wired.** The route exists and was already flagged in its own header as reachable by nothing — it has no entry point in the app, so wiring it to live data would light up a screen no one can navigate to. Giving it an entry point is a product decision. |
