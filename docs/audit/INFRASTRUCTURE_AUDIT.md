# Infrastructure & CI Audit

> Scope: `infra/terraform`, `infra/k8s`, `infra/helm`, `infra/docker`,
> `ci/.github/workflows`, root `Makefile`, `scripts/`, root environment
> templates.

## 1. Strengths

- **Terraform shape is sensible.**
  - GCS state backend isolated per environment
    (`infra/terraform/envs/dev/main.tf:9-12`).
  - Cloud SQL forces private VPC and disables public IP
    (`modules/cloud_sql/main.tf:13-16`).
  - GKE has Workload Identity enabled (`modules/gke/main.tf:12-14`)
    and dedicated secondary IP ranges for pods/services.
  - Cloud NAT controls egress (`modules/network/main.tf:28-34`).
  - Prod-only PITR and deletion protection on Cloud SQL
    (`modules/cloud_sql/main.tf:11,19`).
- **CI uses OIDC / Workload Identity Federation** in
  `ci/.github/workflows/deploy.yml:12` — no static GCP keys.
- **Backend build workflow caches Docker layers via GHA cache**
  (`backend-build.yml:50-51`).
- **Third-party Actions are version-pinned** (tags, not `@main`).
- **Healthchecks present** on every datastore in `docker-compose.yml`
  and on backend deployments in `infra/k8s/base/*.yaml:22-29`.
- **Helm umbrella chart exists** under `infra/helm/medapp/` for
  multi-service release coordination.

## 2. Critical and high-severity findings

| ID | Severity | Finding | Location |
|---|---|---|---|
| I-1 | Critical | Live `GROQ_API_KEY` on disk | `agents/.env:1` (C-1) |
| I-2 | Critical | Pods run as root with writable rootfs and no NetworkPolicy | `infra/k8s/base/*.yaml` (C-10) |
| I-3 | Critical | Default credentials in compose: Postgres/Mongo/RabbitMQ all `medapp/medapp`; JWT/webhook secrets `change-me-in-production` | `infra/docker/docker-compose.yml:12-13, 30-31, 52-54, 164, 174-175` (C-11) |
| I-4 | High | Secret Manager module declares secrets but no IAM bindings — any project member can read | `infra/terraform/modules/secret_manager/main.tf:1-9` |
| I-5 | High | GKE `deletion_protection = false` even in prod-shaped configs | `infra/terraform/modules/gke/main.tf:10` |
| I-6 | High | Dev overlay uses mutable `latest` tag | `infra/k8s/overlays/dev/kustomization.yaml:9` |
| I-7 | High | `backend-ci.yml` and `agents-ci.yml` lack a top-level `permissions:` block; workflows inherit broad defaults | `ci/.github/workflows/` |
| I-8 | High | Third-party Actions pinned to tags, not SHAs | Same |
| I-9 | Medium | Staging overlay is near-identical to base — no real isolation | `infra/k8s/overlays/staging/kustomization.yaml` |
| I-10 | Medium | Prod overlay only changes replica count — no resource bumps, no PDBs | `infra/k8s/overlays/prod/kustomization.yaml:6-11` |
| I-11 | Medium | No ServiceAccount `RoleBinding`s defined for the ServiceAccounts referenced in deployments | `infra/k8s/base/*.yaml` |
| I-12 | Medium | No image scanning (Trivy / Snyk / `docker scout`) step in build workflows | `ci/.github/workflows/` |
| I-13 | Medium | No `terraform plan` summary posted back to PRs | `ci/.github/workflows/terraform-plan.yml` |
| I-14 | Medium | GCS buckets do not enforce `public_access_prevention` at the module level | `infra/terraform/modules/` |
| I-15 | Medium | Dev GKE node pool auto-scales to 10 — no upper guard for cost | `modules/gke/main.tf` |
| I-16 | Low | Dockerfiles in `backend/services/*` do not declare `USER` | All |
| I-17 | Low | No `terraform fmt` / `tflint` / `tfsec` gating in CI | Workflows |
| I-18 | Low | `Makefile` `dev-all` brings up agents that immediately require manual env edits — no `make secrets` helper | Root `Makefile` |

## 3. Compose: what should change for shared dev environments

`infra/docker/docker-compose.yml` is treated as production-shaped
config in places (it sets JWT secrets, webhook secrets, and DB
credentials directly in the file). For a shared dev VM this is
indistinguishable from committing a `.env`. The fix is mechanical:

1. Move every credential into `infra/docker/.env` (gitignored).
2. Ship `infra/docker/.env.example` with placeholders only.
3. Add a `make dev-secrets` target that generates random local values
   on first run.

## 4. Kubernetes hardening baseline

The minimum acceptable `securityContext` for every workload:

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 10001
  runAsGroup: 10001
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop: ["ALL"]
  seccompProfile:
    type: RuntimeDefault
```

Add a default-deny NetworkPolicy per namespace and explicit allow
policies for the specific service-to-service edges. Pin every image to
a digest (`@sha256:…`), and let `kustomize edit set image` rewrite
digests during release rather than relying on `latest`.

## 5. CI hardening baseline

Every workflow should set the minimum permissions explicitly:

```yaml
permissions:
  contents: read
  id-token: write   # only where OIDC is needed
```

Pin third-party Actions to SHAs (Dependabot can keep the SHAs current
by raising PRs). Add `tfsec` and `trivy fs` jobs to the backend and
infra workflows. Block merges on a passing `terraform plan` PR
comment.

## 6. Terraform improvements worth scheduling

1. Add explicit IAM bindings on each Secret Manager secret (least
   privilege, ideally one secret per service identity).
2. Enable `public_access_prevention = "enforced"` on every GCS bucket
   module.
3. Enable VPC Service Controls around the project to keep Cloud SQL,
   GCS, and Secret Manager inside a defined perimeter.
4. Turn on `deletion_protection` for GKE in staging and prod.
5. Add per-environment guardrails for node-pool max size.
6. Add Cloud Armor in front of the gateway service for L7 WAF rules.

## 7. What is fine to leave alone

- The terraform layout (`envs/` + `modules/`) is conventional and
  scales.
- The Helm umbrella chart is the right shape for grouping services.
- OIDC-based GCP auth in CI is the modern approach — keep it.
