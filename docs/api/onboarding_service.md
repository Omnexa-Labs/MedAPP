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

## Mobile/web boundary

The established product boundary keeps credential uploads, legal-entity details,
team setup and submission in a web onboarding flow. The earlier documentation
named `lib/partner/open-onboarding.ts` as implemented, but that file is absent.
The configured `partnerOnboardingUrl` exists; a working launcher, authenticated
handoff, callback refresh and the web application flow still need implementation.
`admin_web` currently contains a scaffold, not a completed onboarding/review portal.

The mobile client reads applications and summaries. Review is an administrator
operation. Approval changes the application's status only: the current service
does not provision a doctor/nurse profile, update the user role or create a tenant.
Do not infer active professional access from an approved application.

## Gaps and hazards

- **`rejection_reason` must be shown only when the status is rejected.** A stale reason left on a
  resubmitted application would tell an approved partner they had been turned down. The client
  carries it through; the screen has to gate it.
- **`partner_type`, `onboarding_mode` and `status` are StrEnums server-side but arrive as plain
  strings.** Treated as free text, consistent with every other status field in this codebase.
- **`display_name` is nullable**; `legal_name` is not. Fall back to the legal name.
- **No pagination** on applications.

## Wiring status — 2026-09-14

Patient Profile → Professional applications and access opens the mobile status
screen. It fetches application records with account/session scope, shows only the
current owner's rows (admin list responses may include others), and handles
loading, empty, draft, submitted, under-review, approved, rejected, unknown-status
and retry states. Rejection feedback appears only on rejected applications. It no
longer fabricates submission or a review deadline when no application exists.

The user-service role is preserved separately as `User.accountRole`. Activated
doctor/nurse roles expose professional editor entry; the editor and doctor
workspace then check the authenticated self-profile endpoint. API permissions
remain enforced by each service. No application status elevates client/server
permissions. Full web application/credential handling, approval provisioning,
revocation/session refresh, partner-kind selection and reference acceptance remain
open B03 work. Current software evidence is in the completion baseline; historical
200 checks in the route table do not constitute new live-gateway acceptance.
