# MedAPP — Principal Engineer Audit: Executive Summary

**Date:** 2026-05-20
**Auditor:** Principal Engineering Review
**Scope:** Backend (18 services), Frontend (4 apps), Infrastructure (Docker/K8s/Helm/Terraform), CI, Project documentation
**Overall risk rating:** **HIGH** — multiple critical issues block a production deployment of a healthcare workload.

---

## 1. Headline assessment

MedAPP is an **ambitious, well-structured healthcare microservices platform** with strong
documentation discipline, a coherent service taxonomy, and good local-dev ergonomics.
However, it is **not yet production-ready for handling PHI** (Protected Health
Information). The same patterns that make local dev fast — fallback secrets in code,
permissive CORS, localStorage tokens, exposed admin ports, no network policies — are
unacceptable in a HIPAA-class environment.

The platform sits between **Phase 0 (scaffold) and Phase 1 (production-ready core paths)**.
With ~3–4 weeks of focused security hardening, the platform can clear the highest-severity
blockers; HIPAA/SOC 2 readiness requires a further 2–3 months of compliance work
(threat model, audit trails, incident response, key management).

---

## 2. Strengths (carry these forward)

- **Documentation discipline** — `docs/PROJECT.md` is genuinely excellent. ADR template
  in use. Per-service READMEs are consistent.
- **Service architecture** — clean separation, one DB per service, async event bus via
  RabbitMQ, gRPC contracts in `backend/proto`.
- **Auth fundamentals** — Argon2 password hashing, opaque refresh tokens stored as SHA-256
  hashes, JWT with short access TTL (15 min), per-service token re-verification.
- **Mobile app security** — uses `expo-secure-store` (Keychain/Keystore), not
  AsyncStorage; tokens correctly isolated.
- **Audit logging primitives** exist in EHR service for clinician access.
- **Terraform with GCS state**, workload identity federation in CI, prod Cloud SQL with
  PITR + deletion protection.
- **No secrets committed to git** — `.gitignore` is comprehensive, `.env.example` files
  are used correctly.

---

## 3. Top 10 risks (ranked by exploitability × blast radius)

| # | Severity | Risk | Location |
|---|----------|------|----------|
| 1 | **CRITICAL** | Hardcoded admin credentials shipped in frontend bundle (`admin@pharmacy.local` / `ChangeMe!123`) | `frontend/pms_web/src/app/login/page.tsx:10-11` |
| 2 | **CRITICAL** | Stripe webhook secret hardcoded — attacker can forge payment events | `backend/services/payment_service/.../webhooks.py:29` |
| 3 | **CRITICAL** | API gateway CORS = `*` with `allow_credentials=True` — universal CSRF | `backend/services/api_gateway/.../main.py:149-155` |
| 4 | **CRITICAL** | JWT stored in `localStorage` in both hms_web and pms_web — XSS → token theft | `frontend/{hms,pms}_web/lib/stores/auth.store.ts` |
| 5 | **CRITICAL** | Database, RabbitMQ, JWT default credentials (`medapp:medapp`, `change-me-in-production`) committed in `docker-compose.yml` | `infra/docker/docker-compose.yml:11-14,164,174` |
| 6 | **CRITICAL** | PMS seed script writes default admin password to DB if accidentally run in prod | `backend/services/pms_service/.../seed.py:33` |
| 7 | **HIGH** | No Kubernetes NetworkPolicies — east-west traffic unrestricted | `infra/k8s/`, `infra/helm/medapp/` |
| 8 | **HIGH** | Telemedicine room tokens not bound to participant identity — any token holder can join | `backend/services/telemedicine_service/.../room_service.py:50,62` |
| 9 | **HIGH** | EHR consent scope is stored but **not enforced** — clinicians with any consent can read all scopes | `backend/services/ehr_service/.../record_service.py:35-68` |
| 10 | **HIGH** | Next.js 14.2.35 with known CVEs (CSP nonce bypass, image-opt DoS, beforeInteractive XSS); no `package-lock.json` in mobile app | `frontend/{hms,pms}_web/package.json`, `frontend/mobile/` |

---

## 4. Cross-cutting flaws

- **Secret hygiene** — every backend service ships a `jwt_secret = "change-me…"` fallback
  in code. Production must override via env var, but **no service fails at startup if the
  default is still in place**. This is a footgun.
- **CORS** — gateway uses `*`; per-service CORS in PMS/HMS allows `*` methods + headers.
- **Frontend code duplication** — `hms_web` and `pms_web` are near-identical copies; bug
  fixes will drift. Should be extracted to `packages/` shared modules.
- **No image scanning** in CI; no Pod Security Standards; no `securityContext` blocks; no
  resource quotas; no PodDisruptionBudgets.
- **No structured PII redaction in logs** — `structlog` JSONRenderer will serialise any
  field handed to it, including medical data.
- **HIPAA gap** — no documented threat model, no data-flow diagrams, no incident-response
  runbook, no breach-notification SOP, no key-rotation policy, no audit-trail retention spec.

---

## 5. Recommended action plan

### Sprint 1 (this week) — stop the bleeding

1. Delete hardcoded credentials from `pms_web/src/app/login/page.tsx`.
2. Move all webhook secrets (Stripe, PMS) to env vars; **fail service startup** if value
   equals the dev placeholder.
3. Replace gateway CORS `*` with an explicit allowlist; drop `allow_credentials` or pair
   it with the allowlist.
4. Add a startup hook in `shared/auth/principal.py` that refuses to boot a non-dev service
   when `jwt_secret` matches any known placeholder.
5. Remove the PMS seed-with-credentials path from any production rollout pipeline.

### Sprint 2 — token & session hardening

6. Migrate `hms_web` and `pms_web` JWT storage from `localStorage` to `httpOnly` +
   `Secure` + `SameSite=Strict` cookies. Implement Next.js middleware for token refresh.
7. Add a strict Content-Security-Policy header via `next.config.mjs` for both web apps.
8. Implement refresh-token rotation on both web apps.
9. Enforce EHR consent **scope** in `record_service.get_*` paths.
10. Bind telemedicine room tokens to a pre-registered participant list (not just `room_id`).

### Sprint 3 — infrastructure hardening

11. Add NetworkPolicies (default-deny + explicit allow per service pair).
12. Add `securityContext: {runAsNonRoot, capabilities: {drop: [ALL]}}` to all Helm
    templates and Kustomize bases.
13. Pin all image tags to git SHAs; remove `:latest` from helm/values.yaml and overlays.
14. Add Trivy scan stage to `ci/.github/workflows/backend-build.yml`; fail on
    HIGH/CRITICAL CVEs.
15. Replace docker-compose hardcoded DB/queue passwords with `${VAR:?must be set}`
    pattern and load from `.env` (gitignored).

### Sprint 4 — compliance foundations (parallel to Sprint 3)

16. Author **threat model** and **data-flow diagram** for PHI handling.
17. Author **incident-response runbook** (`docs/runbooks/incident-response.md`).
18. Author **breach-notification SOP** with regulator timelines (HIPAA: 60 days, GDPR:
    72 hours).
19. Implement structured **log redaction** for `email`, `phone`, `medical_*`, `dob`,
    `ssn`, `insurance_*` — and document the redaction matrix.
20. Define **audit-trail retention policy** (recommend 6 years immutable, append-only).

### Sprint 5+ — production readiness

21. Implement the TODO Kubernetes migration jobs (`infra/k8s/base/jobs/migrate-*.yaml`)
    and gate deploys behind successful migration runs.
22. Author CONTRIBUTING.md, PR template, and code-review checklist.
23. Enable GKE binary authorisation, network policy, shielded nodes.
24. Move secrets to Google Secret Manager; remove all env-var fallbacks for production.
25. Add SLO dashboards (Prometheus/Grafana) for the targets stated in PROJECT.md
    (p95 < 300 ms, 99.9 % availability, P2P video < 150 ms).

---

## 6. Compliance posture summary

| Requirement | Status | Gap |
|-------------|--------|-----|
| HIPAA Security Rule — access controls | Partial | EHR audit exists; scope not enforced; no anomaly detection |
| HIPAA Security Rule — audit logs | Partial | Authentication audited; PHI access partial; no retention spec |
| HIPAA Security Rule — transmission security | Partial | TLS assumed; no certificate pinning in mobile; no E2EE for telemedicine |
| HIPAA Breach Notification Rule | **Missing** | No incident-response runbook |
| HIPAA Privacy Rule — minimum necessary | Partial | Consent model exists; scope not enforced |
| GDPR Art. 30 (record of processing) | Missing | No data-processing inventory |
| GDPR Art. 32 (security) | Partial | Argon2 + JWT good; no documented key rotation |
| GDPR Art. 33–34 (breach notification) | Missing | No 72-hour SOP |
| GDPR Art. 35 (DPIA) | Missing | No DPIA template |
| SOC 2 Type II readiness | Phase 4 (per roadmap) | No scope, no firm, no timeline |

---

## 7. Severity totals across all reports

| Severity | Count |
|----------|-------|
| CRITICAL | 11 |
| HIGH     | 20 |
| MEDIUM   | 23 |
| LOW      | 6  |

See the scope-specific reports for the line-level findings behind these counts.

---

## 8. Recommended cadence

- **Re-audit**: every quarter, and after any major architectural change.
- **Security review**: every PR touching auth, payments, EHR, or telemedicine.
- **Dependency scan**: weekly in CI.
- **Threat-model refresh**: annually, or on any new data-store / external-system integration.
