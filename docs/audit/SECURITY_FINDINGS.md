# Security Findings Register

> Consolidated, sortable register of every security-relevant finding
> across the four audit documents. Use this as the source of truth when
> opening tickets or building a CVE-style tracking sheet.

## Severity counts

| Severity | Count |
|---|---|
| Critical | 11 |
| High | 14 |
| Medium | 18 |
| Low | 7 |

## Register

| ID | Severity | Domain | Title | Location |
|---|---|---|---|---|
| C-1 | Critical | Agents | Live `GROQ_API_KEY` on disk | `agents/.env:1` |
| C-2 | Critical | Backend / shared | Shared `"change-me"` HS256 default across all services | `backend/shared/shared/auth/principal.py:25` + every service config |
| C-3 | Critical | Backend (HMS) | SQL injection in tenant DB creation | `backend/services/hms_service/app/services/tenant_service.py:60` |
| C-4 | Critical | Agents | Unauthenticated `/chat` endpoints, `patient_id` from body | `agents/services/*/app/base_agent.py:53-55` |
| C-5 | Critical | Backend (EHR) | Admin role skips clinician and consent checks | `backend/services/ehr_service/app/services/record_service.py:38-41` |
| C-6 | Critical | Backend (Gateway) | `allow_origins=["*"]` with credentials | `backend/services/api_gateway/app/main.py:150` |
| C-7 | Critical | Frontend | Auth tokens in `localStorage` | `frontend/{hms_web,pms_web}/src/lib/...` |
| C-8 | Critical | Backend (Payments) | Stripe verified against `"change-me"`; M-Pesa unverified; PMS webhook secret weak | `backend/services/payment_service/app/routers/webhooks.py:29,42-44`; `pms_service/app/config.py:28` |
| C-9 | Critical | Backend (User) | Profile PATCH allows arbitrary field write incl. `role` | `backend/services/user_service/app/routers/profiles.py:25-26` |
| C-10 | Critical | Infra (K8s) | Pods as root, no NetworkPolicy, `latest` image in dev | `infra/k8s/base/*.yaml`; `infra/k8s/overlays/dev/kustomization.yaml:9` |
| C-11 | Critical | Infra (Compose) | Hardcoded credentials and `change-me` JWT/webhook secrets | `infra/docker/docker-compose.yml:12-13, 30-31, 52-54, 164, 174-175` |
| B-2 | High | Backend | No JWT `aud` claim — token confusion | `backend/shared/shared/auth/jwt.py:7-18` |
| B-3 | High | Backend | JWT decode not pinned to a single algorithm | `backend/shared/shared/auth/principal.py:25` |
| B-4 | High | Backend (HMS) | `dev_auth` router can mint admin tokens | `backend/services/hms_service/app/routers/dev_auth.py` |
| B-9 | High | Backend (HMS) | Tenant middleware trusts `X-Tenant` header | `backend/services/hms_service/app/main.py:51` |
| B-12 | High | Backend (User) | PHI stored as free-form JSON | `backend/services/user_service/app/models/user.py:25-26` |
| B-17 | High | Backend (Payments) | Refund handling lacks idempotency keys | `backend/services/payment_service/app/services/payment_service.py:94-125` |
| B-19 | High | Backend (Events) | No retry / DLQ in event bus | `backend/shared/shared/events/bus.py:35-47` |
| B-22 | High | Backend (Booking) | No rate limit on booking creation | `backend/services/booking_service/app/services/booking_service.py:53-83` |
| A-3 | High | Agents | Tool error bodies returned raw to LLM (PHI leak) | `agents/services/concierge_agent/app/tools.py:135` |
| A-4 | High | Agents | PHI redaction covers only email/phone/SSN | `agents/shared/phi.py` |
| A-5 | High | Agents | No request signing on agent → backend calls | `agents/services/*/app/tools.py` |
| F-2 | High | Frontend | No Next.js middleware route protection | `frontend/*` |
| F-3 | High | Frontend | `admin_web` is a placeholder but shipped | `frontend/admin_web/src/app/` |
| F-4 | High | Frontend | No CSP / security headers in `next.config.mjs` | `frontend/*/next.config.mjs` |
| F-5 | High | Frontend | Client-side role checks treated as enforcement | `frontend/hms_web/src/lib/utils/permissions.ts` |
| I-4 | High | Infra (Terraform) | Secret Manager secrets have no IAM bindings | `infra/terraform/modules/secret_manager/main.tf:1-9` |
| I-5 | High | Infra (Terraform) | GKE deletion protection disabled | `infra/terraform/modules/gke/main.tf:10` |
| I-6 | High | Infra (K8s) | Dev overlay uses `latest` tag | `infra/k8s/overlays/dev/kustomization.yaml:9` |
| I-7 | High | CI | Missing top-level `permissions:` in workflows | `ci/.github/workflows/backend-ci.yml`, `agents-ci.yml` |
| I-8 | High | CI | Third-party Actions not pinned to SHAs | All workflows |
| B-5 | Medium | Backend | No JWT key rotation (`kid` missing) | `backend/shared/shared/auth/jwt.py` |
| B-6 | Medium | Backend | No per-IP throttling on OTP request | `backend/services/user_service/app/config.py:20-23` |
| B-10 | Medium | Backend (EHR) | Weak row-level access predicates | `backend/services/ehr_service/app/repositories/` |
| B-13 | Medium | Backend | Error responses leak exception details | `pms_service/app/routers/integrations.py:36-37` |
| B-14 | Medium | Backend | No per-endpoint request size limits | All services |
| B-18 | Medium | Backend | No payment reconciliation job | `payment_service` |
| B-20 | Medium | Backend | Outbox publisher not implemented | `backend/shared/shared/events/` |
| B-21 | Medium | Backend | Default DB pool config (no overflow tuning) | `backend/shared/shared/db/session.py:7-8` |
| B-23 | Medium | Backend (Gateway) | In-process rate limit does not scale | `api_gateway/app/main.py` |
| B-24 | Medium | Backend | Dockerfiles run as root | All `backend/services/*/Dockerfile` |
| A-6 | Medium | Agents | `metadata: dict` is untyped | `agents/services/*/app/base_agent.py:20-24` |
| A-7 | Medium | Agents | Tool outputs not sanitised before re-entering context | All tool wrappers |
| A-8 | Medium | Agents | `service_token` default `"change-me"` | All agent `config.py` |
| F-6 | Medium | Frontend | No refresh-token flow on web | `pms_web` / `hms_web` interceptors |
| F-7 | Medium | Frontend | Interceptor handles only 401 | All apps |
| F-8 | Medium | Frontend (Mobile) | Hardcoded localhost API fallback | `frontend/mobile/src/core/env.ts:16` |
| F-9 | Medium | Frontend | Dependency drift across monorepo | `frontend/*/package.json` |
| I-9 | Medium | Infra (K8s) | Staging overlay barely differs from base | `infra/k8s/overlays/staging/kustomization.yaml` |
| I-10 | Medium | Infra (K8s) | Prod overlay only changes replica count | `infra/k8s/overlays/prod/kustomization.yaml:6-11` |
| I-11 | Medium | Infra (K8s) | No RoleBindings for ServiceAccounts referenced | `infra/k8s/base/*.yaml` |
| I-12 | Medium | CI | No image scanning step | `ci/.github/workflows/` |
| I-13 | Medium | CI | `terraform plan` not posted to PR | `ci/.github/workflows/terraform-plan.yml` |
| I-14 | Medium | Infra (Terraform) | No `public_access_prevention` on buckets | `infra/terraform/modules/` |
| I-15 | Medium | Infra (Terraform) | Dev GKE max node count too high | `modules/gke/main.tf` |
| B-25 | Low | Backend | No pinned base image digests in Dockerfiles | All |
| B-26 | Low | Backend | Some Dockerfiles are not multi-stage | All |
| A-9 | Low | Agents | Stub agents ship the same `/chat` surface | `agents/services/*` |
| A-10 | Low | Agents | Zero tests beyond healthz | `agents/services/*/tests/` |
| F-10 | Low | Frontend | No unit tests anywhere | `frontend/*` |
| F-11 | Low | Frontend | No shared UI / API client packages | `frontend/{hms_web,pms_web}/src/components/ui` |
| I-16 | Low | Infra | Dockerfiles do not declare `USER` | All `backend/services/*/Dockerfile` |
| I-17 | Low | CI | No `tfsec` / `terraform fmt` gating | Workflows |
| I-18 | Low | DevX | No `make secrets` helper | Root `Makefile` |

## Compliance posture (quick read)

- **HIPAA**: blocked today by C-5 (admin bypass), C-4 (agent IDOR
  with PHI), A-3/A-4 (PHI leakage to LLM and logs), B-12 (PHI in
  free-form JSON without field-level encryption), and the absence of
  a documented Business Associate Agreement workflow.
- **GDPR / NDPR / DPA 2012**: blocked by the same controls plus the
  absence of a documented consent management surface beyond the EHR
  service's row-level check.
- **PCI-DSS**: out of scope today — payments are mediated through
  Stripe/M-Pesa/PayPal, so MedApp is a SAQ-A merchant *only if* the
  card never touches MedApp servers. C-8 must be fixed regardless.
