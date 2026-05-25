# Remediation Roadmap

> Sequenced plan to move MedApp from "Phase 0 with sharp edges" to a
> defensible Phase 1 baseline. Each item references the finding IDs
> from `SECURITY_FINDINGS.md`.

## Sequencing principles

1. **Live secrets first.** Anything that is exploitable from outside
   the building right now wins ordering.
2. **Defaults before features.** Replace dangerous defaults before
   any new wiring lands on top of them.
3. **Runtime hardening before scale.** K8s `securityContext`, CI
   permissions, and dependency pinning are cheap, broad wins.
4. **Coverage last.** Tests come after the surfaces they cover are
   stable.

## Day 0 — within 24 hours

| # | Action | Findings |
|---|---|---|
| 0.1 | Rotate the Groq key; delete `agents/.env` plaintext value | C-1 |
| 0.2 | Replace every `change-me`-class default with `os.environ[...]` and a startup assertion (`assert len(secret) >= 32`) | C-2, C-8, C-11 |
| 0.3 | Generate per-environment 32-byte JWT secrets and webhook secrets; store in GCP Secret Manager | C-2, C-8 |
| 0.4 | Restrict CORS at the gateway to a real allowlist read from env | C-6 |
| 0.5 | Audit `.gitignore` coverage for every `.env*` path and add a `git ls-files | grep .env` CI check | C-1 |

**Exit criteria:** no service starts without a real secret; no live
provider key exists outside Secret Manager; the gateway rejects `*`.

## Week 1 — critical code paths

| # | Action | Findings |
|---|---|---|
| 1.1 | Fix HMS SQLi: validate slug with `^[a-z0-9_]{3,32}$`, use `psycopg2.sql.Identifier` for DDL | C-3 |
| 1.2 | Remove `dev_auth` from HMS or gate it behind a build flag absent from prod images | B-4 |
| 1.3 | Add JWT middleware to every agent endpoint; derive `patient_id` from `sub` | C-4 |
| 1.4 | Sign agent → backend calls (HMAC over method+path+body+timestamp) | A-5 |
| 1.5 | Remove the admin shortcut in `ehr_service`; require consent or break-glass with audit | C-5 |
| 1.6 | Whitelist fields in profile PATCH; add regression test for `role` escalation | C-9 |
| 1.7 | Add `aud` claim to JWTs; enforce in shared verifier; pin `algorithms=["HS256"]` | B-2, B-3 |
| 1.8 | Replace Stripe `"change-me"` with env-only secret; add M-Pesa HMAC verification | C-8 |
| 1.9 | Add idempotency keys to refund creation | B-17 |
| 1.10 | Expand `agents/shared/phi.py` to cover the HIPAA Safe Harbor 18 identifiers; sanitise tool error bodies | A-3, A-4 |

**Exit criteria:** every critical finding closed; CI has a regression
test for each fixed path.

## Week 2 — runtime and CI hardening

| # | Action | Findings |
|---|---|---|
| 2.1 | Add the standard `securityContext` to every K8s base manifest | C-10 |
| 2.2 | Add a default-deny `NetworkPolicy` per namespace + explicit allows | C-10 |
| 2.3 | Pin all images to `@sha256:…` digests in overlays; remove `latest` from dev | I-6 |
| 2.4 | Add a top-level `permissions:` block to every workflow | I-7 |
| 2.5 | Pin every third-party Action to a commit SHA; enable Dependabot for `github-actions` | I-8 |
| 2.6 | Add Trivy filesystem and image scanning steps to backend and agents workflows | I-12 |
| 2.7 | Add `tfsec` and `terraform fmt -check` jobs to terraform workflow | I-17 |
| 2.8 | Post `terraform plan` summary as a PR comment | I-13 |
| 2.9 | Add IAM bindings to Secret Manager secrets in Terraform | I-4 |
| 2.10 | Enable `public_access_prevention = "enforced"` on every GCS bucket | I-14 |
| 2.11 | Move web auth to httpOnly cookies via Next.js route handlers; remove `localStorage` | C-7 |
| 2.12 | Add `middleware.ts` route protection in all web apps | F-2 |
| 2.13 | Ship CSP (Report-Only first), `X-Frame-Options`, `X-CTO`, HSTS | F-4 |

**Exit criteria:** no high-severity finding outstanding; all
deployments come from pinned images; tokens never touch
`localStorage`.

## Week 3 — reliability and consistency

| # | Action | Findings |
|---|---|---|
| 3.1 | Implement the outbox publisher and consumer retry/DLQ | B-19, B-20 |
| 3.2 | Add per-user booking rate limit (Redis token bucket) | B-22 |
| 3.3 | Replace in-process gateway rate limiter with a Redis-backed one | B-23 |
| 3.4 | Add per-endpoint request size limits | B-14 |
| 3.5 | Add per-IP throttling on OTP request | B-6 |
| 3.6 | Standardise Dockerfiles: non-root user, digest-pinned base, multi-stage | B-24, B-25, B-26, I-16 |
| 3.7 | Refresh-token flow on web; handle 403/5xx/timeout in interceptors | F-6, F-7 |
| 3.8 | Consolidate frontend dependencies under pnpm workspaces | F-9 |
| 3.9 | Add a backend test floor: auth happy/sad, one IDOR, one migration round-trip per service | A-10, F-10 |

**Exit criteria:** the outbox is real; tests catch the classes of bug
we just fixed; frontends share a baseline.

## Phase 1 backlog (not sprint work, but on the board)

- **Field-level encryption for PHI columns** (allergies, medical
  history, lab metadata) using KMS keys; rotate annually. (B-12)
- **VPC Service Controls** around the project perimeter.
- **Cloud Armor** in front of the gateway with managed WAF rules.
- **Shared UI / API client packages** for the web apps. (F-11)
- **`admin_web` fully built** or removed from the repo. (F-3)
- **Per-service ServiceAccount + RoleBinding** in K8s. (I-11)
- **Real staging/prod overlay differences** (resources, PDBs,
  HPAs). (I-9, I-10)
- **OpenTelemetry tracing** wired end-to-end through agents,
  gateway, and services; PHI redaction in the trace exporter.

## Tracking suggestion

Convert this roadmap into one issue per row in your tracker, labelled
by finding ID (`audit/C-2`, `audit/B-19`, etc.). Every PR closing an
audit issue should cite the ID in the commit footer:

```
Closes: audit/C-2
```

so the audit register, the codebase, and the tracker stay in sync.
