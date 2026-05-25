# ADR 0014 — Promotion gates, Binary Authorization, External Secrets

- **Status**: Accepted
- **Date**: 2026-05-24

## Context

Slice 5 closes the last meaningful security gap in the CI/CD pipeline:

- **Promotion was unprotected.** `deploy.yml` accepted a workflow_dispatch
  from anyone with write access, against any env, with any image tag.
- **Cluster admission was unauthenticated.** A pod manifest with any
  image reference would be admitted; Cosign signatures from Slice 4
  weren't verified at runtime.
- **Secrets were shared.** The Helm chart's deployment referenced a
  single `medapp-secrets` Secret. A pod leak in user_service exposed
  payment_service's secrets and vice versa.

## Decision

Three things wired in one slice:

### 1. Per-environment promotion gates

`deploy-dev.yml` auto-deploys to dev on every successful build, scoped
to commits on main only. `deploy.yml` is now staging/prod-only manual
promotion. Both leverage GitHub Environments (`dev` / `staging` / `prod`)
to carry env-specific secrets AND the protection rules a one-time
operator setup configures in the UI (required reviewers, wait timer,
allowed-branches=main only).

The `deploy.yml` workflow runs `cosign verify` against every service
image before invoking helm on prod — second line of defense alongside
Binary Authorization's admission-time check.

**Why GitHub Environments rather than a custom approval mechanism**:
the UI-configured protection rules give us 80% of what a custom
approval flow gives, with zero code to maintain. The wait timer in
particular is hard to recreate elsewhere — it's a deliberate friction
that catches typo'd workflow dispatches in the window between
"deploy clicked" and "deploy actually starts".

### 2. Binary Authorization

`modules/binary_authorization` creates the project-singleton policy
with a Cosign Sigstore attestor wired to the Slice 4 build-and-push
workflow's keyless signatures.

- Dev + staging: `ALWAYS_ALLOW`. Engineers iterate on local builds.
- Prod: `REQUIRE_ATTESTATION` with `enforcement_mode = DRYRUN_AUDIT_LOG_ONLY`
  initially. After the first signed deploy lands and the operator
  verifies it passes (via Cloud Audit Logs), flip to
  `ENFORCED_BLOCK_AND_AUDIT_LOG`.

**Why DRYRUN first**: the alternative — flipping enforcement on
immediately — risks the first prod deploy after this slice blocking
because Slice 4's signing pipeline hasn't run for the prod project
yet. DRYRUN lets us audit the policy without bricking deploys, then
flip when we have evidence the attestor verifies cleanly.

**Why the Sigstore attestor and not a CloudKMS-backed one**: Sigstore
keyless signatures (Slice 4) already exist; CloudKMS would require a
parallel signing path. Sigstore's Rekor transparency log is also more
auditable than a private CloudKMS key.

### 3. External Secrets Operator + per-service GSM secrets

`modules/secret_manager` now creates one GSM secret per service
(`medapp-<env>-<service>`) plus a dedicated `external-secrets-reader-wi`
GSA that has `secretAccessor` on each secret. Tightens the Slice 4
baseline by replacing project-level `secretAccessor` with per-secret
bindings.

A new `infra/helm/platform/` chart installs the External Secrets
Operator + a `ClusterSecretStore` pointing at GSM via the ESO reader
GSA. The medapp chart gains an `externalSecrets.enabled` flag
(default false so it installs cleanly before the platform chart runs)
that, when on, renders a per-service `ExternalSecret` projecting
`medapp-<env>-<service>` into a K8s Secret named after the service.
The Deployment's `envFrom` already references per-service Secret/ConfigMap
names — the rename happened in the same slice.

**Why separate platform chart**: ESO is a cluster-wide CRD-installing
operator. Installing it as part of the app chart would: (a) couple
the app's release lifecycle to the operator's, (b) require the app
chart to re-install ESO on every deploy. One-shot platform chart is
the cleaner separation.

**Why `dataFrom.extract` not `data.remoteRef`**: each service has one
secret payload that's a JSON blob with N keys. `extract` expands all
keys into the K8s Secret in one declaration; `remoteRef` would force
us to enumerate every key (a per-service tuple that's another file to
keep in sync).

**Why `creationPolicy: Owner` + `deletionPolicy: Retain`**: ESO owns
the K8s Secret it creates (Owner — delete the ExternalSecret and the
Secret goes too), but a delete of the K8s Secret directly does not
auto-recreate it (Retain — operator must explicitly remove the
ExternalSecret to trigger re-creation). Trade-off favours operator
control over auto-recovery.

## Consequences

**Good:**
- Prod deploys now require: (a) a successful build with Trivy +
  Cosign, (b) a 30-minute wait window, (c) two reviewers, (d)
  `cosign verify` passing in the deploy workflow, (e) Binary
  Authorization attestation check at admission. Five independent
  gates.
- A compromised pod sees only its own service's secrets. Slice-4's
  per-service GSAs already give per-service audit log identity; this
  slice gives per-service blast-radius isolation on secrets too.
- The medapp chart still installs on a fresh cluster (CRDs absent)
  because ExternalSecret is feature-flagged. Platform chart install is
  a separate one-time operator step.
- Rollback is a re-run of `deploy.yml` with a prior commit SHA. No
  custom rollback tooling.

**Bad:**
- The 30-minute prod wait timer is a real friction for emergency
  fixes. Operator escalation: bypass via the GitHub UI (the wait
  timer is an Environment setting, can be temporarily lowered by an
  admin). Document in the incident runbook.
- ESO refresh interval is 1 hour by default. Operator-rotated secrets
  take that long to land in pods. For immediate rotation, restart the
  deployment. Documented in the platform chart README.
- `cosign verify` in the deploy workflow adds ~30 seconds per service
  × 18 services. Acceptable for prod; staging skips this step.
- Adding a new service now requires updating four places: the
  Helm values catalog, the build matrix path filter, the env stack
  service list, and (when slice 6 adds Cloud Armor) the WAF
  config. Document the checklist.

**Out of scope:**
- KMS CMEK on GSM secrets (relies on a separate CMEK rotation
  pipeline) → slice 6.
- Cloud Armor / WAF at the ingress → slice 6.
- Per-service-per-key GSM secrets (one secret per env var instead of
  one secret per service) — heavier IAM, doesn't pay for itself
  before a real audit demands it.
- Vault as an alternative to GSM — GSM with WI is the lower-friction
  default for a small team; Vault becomes relevant when ops grows
  beyond one operator.
