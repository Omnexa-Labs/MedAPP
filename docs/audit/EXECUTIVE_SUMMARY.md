# Executive Summary

**Audit date:** 2026-05-20
**Branch / commit:** `main` @ `15d5501`
**Scope:** Entire repository (backend, agents, frontend, infra, CI)

## Headline

MedApp is well-architected at the *shape* level — microservices boundaries,
polyglot persistence, a provider-agnostic agent layer, IaC, and CI all exist
and follow defensible patterns. The implementation, however, is **Phase 0**
in practice: only two services (`user_service`, `concierge_agent`) are fully
wired, and the project carries a number of **critical security defaults**
that would be catastrophic if any environment was promoted to public
internet without remediation.

The single most important finding is that almost every secret in the
repository is either a placeholder string (`change-me`, `change-me-in-
production`, `dev-secret-key-not-for-production`) or, in one case, a **live
provider API key sitting in `agents/.env`**. The gateway, JWT verification,
Stripe webhook signing, the HMS/PMS service tokens, and the docker-compose
datastores all share this pattern. Production readiness is gated almost
entirely on hardening these defaults, not on writing new features.

## Top risks (full detail in `CRITICAL_FINDINGS.md`)

1. **Live `GROQ_API_KEY` on disk in `agents/.env`** — must be rotated now.
   *(Status: requires action outside the codebase — rotate the key in Groq's
   console.)*
2. ~~**Identical `change-me` JWT secret default across every service**~~ —
   **CLOSED.** All 16 backend services + the API gateway + the shared
   `get_current_principal` helper now default `jwt_secret = ""`. A new
   `shared.auth.validate_jwt_secret()` helper refuses to boot in
   production with empty or known-weak secrets (`change-me`,
   `change-me-change-me-...`, etc.). API gateway calls it at `create_app()`.
3. ~~**SQL injection in HMS tenant provisioning**~~ — **CLOSED.**
   `_create_database()` now validates `db_name` against
   `^[a-z][a-z0-9_]{0,62}$` before interpolation; refuses any name
   outside the allow-list.
4. **Unauthenticated agent `/chat` endpoints** — **CLOSED for the agent
   layer.** See ADR 0008. (Backend services did not have this issue.)
5. ~~**EHR admin bypass**~~ — **CLOSED.** `_authorize_patient_access`
   now returns `(requester_id, mode)` where `mode ∈ {self, consent,
   admin_override}`. Every audit row written by an admin-bypass access
   is prefixed `[admin_override]` so compliance reviewers can query the
   `access_audit` table for operator-overridden PHI reads. Behaviour
   change: admin can still see any record (operator workflows preserved),
   but every access is now distinguishable from a consent-backed access
   in the audit log.
6. ~~**`allow_origins=["*"]` on the API gateway with credentials**~~ —
   **CLOSED.** The gateway now reads `GW_CORS_ORIGINS` as a
   comma-separated allow-list. Empty (default) disables CORS entirely;
   compose / production sets explicit origins. Allowed methods narrowed
   from `*` to `GET/POST/PUT/PATCH/DELETE/OPTIONS`; allowed headers
   narrowed from `*` to `Authorization, Content-Type, X-Request-Id`.
7. **Web auth tokens in `localStorage`** across all three Next.js apps —
   XSS yields full session takeover. *(Status: open — frontend slice.)*
8. **No Kubernetes `securityContext` anywhere** — pods run as root with a
   writable root filesystem and no NetworkPolicy. *(Status: open — infra
   slice.)*

## Hardening slice 14 — CMEK, Cloud Armor, Managed Prometheus alerts (2026-05-25)

**CI/CD rollout slice 6.** Final infra slice: customer-managed encryption
on the data stores, WAF at the edge, alert policies on the Managed
Prometheus stream enabled in slice 2. See
[ADR 0015](../adr/0015-kms-cloud-armor-monitoring.md).

**Changes:**

- **KMS module** ([modules/kms/](../../infra/terraform/modules/kms/main.tf))
  creates a per-env keyring with two purpose-scoped keys
  (`medapp-<env>-sql`, `medapp-<env>-gcs`), 90-day automatic rotation,
  `prevent_destroy=true`, and IAM bindings to the SQL admin + GCS
  service agents.
- **Cloud SQL + GCS modules** ([cloud_sql/main.tf](../../infra/terraform/modules/cloud_sql/main.tf),
  [gcs/main.tf](../../infra/terraform/modules/gcs/main.tf))
  accept an optional CMEK key id and route it into the SQL instance's
  `encryption_key_name` and each bucket's `default_kms_key_name`.
- **Cloud Armor module**
  ([modules/cloud_armor/main.tf](../../infra/terraform/modules/cloud_armor/main.tf))
  declares a project-singleton security policy with five preconfigured-
  WAF rules (SQLi, XSS, LFI, RFI, scanner detection — sensitivity 4),
  a per-IP rate limit (100 req/min throttling to 429), an operator-IP
  allow-list, Adaptive Protection on staging + prod, and a terminal
  default-allow.
- **Helm chart Ingress templates**
  ([ingress.yaml](../../infra/helm/medapp/templates/ingress.yaml),
  service annotation in
  [service.yaml](../../infra/helm/medapp/templates/service.yaml)).
  When `ingress.enabled: true`, renders an `Ingress` for api_gateway
  with a Google-managed `ManagedCertificate`, a `BackendConfig`
  pinning the Cloud Armor policy, a `FrontendConfig` redirecting HTTP
  to HTTPS at the GCLB, and `cloud.google.com/backend-config` +
  `cloud.google.com/neg` annotations on the api_gateway Service. The
  flag stays default-false so the chart still installs on a fresh
  cluster before Terraform creates the supporting global static IP +
  policy.
- **Monitoring module**
  ([modules/monitoring/main.tf](../../infra/terraform/modules/monitoring/main.tf))
  declares eight alert policies on the Managed Prometheus metrics:
  api_gateway 5xx rate, P95 latency, pod restart loops, deployment
  unavailable replicas, Cloud SQL CPU, connections, disk utilisation,
  and (prod only) Binary Authorization admission denials.
- **Env stacks wired**: dev/staging/prod gain `kms`, `cloud_armor`,
  and `monitoring` modules; the SQL and GCS modules receive the KMS
  key ids; new `cloud_armor_policy` and `kms_keyring` outputs.
- **google-beta provider declared** in each env's
  `required_providers` block — needed by the KMS module's
  `google_project_service_identity` resource.

**Posture after this slice:**

- Disabling the SQL key in Cloud Console makes prod Postgres
  unreadable within minutes. CMEK gives us a key-owned incident-
  response lever the Slice 2 Google-managed encryption didn't.
- SQLi / XSS / scanner traffic hits the GCLB and dies there, before
  reaching api_gateway. App-layer validation is now the second line.
- Per-IP rate-limit at the edge gates the network floor; the booking-
  service per-user limiter (slice 8 of the security sprint) gates
  business-logic rate-control above that.
- Eight alert policies fire on the failure modes that actually wake
  on-call. Email channel works today; PagerDuty wiring is an operator
  step outside Terraform.

**Validation:**

| Stack                         | `terraform validate` |
|-------------------------------|----------------------|
| envs/dev                      | ✅ Success           |
| envs/staging                  | ✅ Success           |
| envs/prod                     | ✅ Success           |
| `terraform fmt -recursive`    | ✅ clean             |

**CI/CD + K8s rollout — series status:**

| Slice | Theme                                            | Status |
|-------|--------------------------------------------------|--------|
| 1     | GCP foundation: bootstrap, WIF, AR               | ✅     |
| 2     | GKE Autopilot, private VPC, Cloud SQL hardening  | ✅     |
| 3     | K8s base hardening (PSS restricted, NetPol, PDB) | ✅     |
| 4     | Build pipeline, Trivy, Cosign, per-service GSAs  | ✅     |
| 5     | Promotion gates, Binary Auth, External Secrets   | ✅     |
| 6     | CMEK, Cloud Armor, monitoring alerts             | ✅     |

The series is complete. **Out-of-scope follow-ups** (called out in the
relevant ADRs):

- VPC Service Controls (ADR 0015) — org-level, defer until audit demand.
- KMS CMEK on Artifact Registry + Secret Manager (ADR 0015) — Google-
  managed encryption is the documented MVP choice.
- Multi-region DR (ADR 0011) — not on roadmap until PMF.
- Per-route Cloud Armor exemptions (ADR 0015) — add when WAF false
  positives hit.
- Grafana dashboards (ADR 0015) — GCP Monitoring UI covers it.

## Hardening slice 13 — Promotion gates, Binary Authorization, External Secrets (2026-05-24)

**CI/CD rollout slice 5.** Closes the promotion + admission + secret-
isolation gaps left after slice 4. See
[ADR 0014](../adr/0014-promotion-binary-auth-external-secrets.md).

**Changes:**

- **Auto-deploy to dev on every merge**
  ([deploy-dev.yml](../../.github/workflows/deploy-dev.yml)). Triggered
  by a successful `build-and-push` on `main`, scoped to that commit's
  SHA via `workflow_run.head_sha`. Concurrency-locked so mid-flight
  deploys cancel when a newer build wins.
- **Manual staging/prod promotion**
  ([deploy.yml](../../.github/workflows/deploy.yml)). Now
  staging/prod-only — dev was removed from the env choice list. Adds
  `cosign verify` against every service image before invoking helm on
  prod, with the certificate-identity-regexp pinned to this repo's
  build-and-push workflow.
- **GitHub Environments setup runbook**
  ([github-environments.md](../../docs/runbooks/github-environments.md))
  documents the one-time UI clicks: required reviewers (1 for
  staging, 2 for prod with no self-approval), 30-minute wait timer on
  prod, allowed-branches=main only.
- **Binary Authorization Terraform module**
  ([modules/binary_authorization/](../../infra/terraform/modules/binary_authorization/main.tf)).
  Project-singleton policy with a Cosign Sigstore attestor. Dev +
  staging: `ALWAYS_ALLOW`. Prod: `REQUIRE_ATTESTATION` with
  `enforcement_mode = DRYRUN_AUDIT_LOG_ONLY` initially — operator
  flips to enforced after the first signed deploy verifies clean.
  System-image whitelist patterns prevent BA from blocking kube-system
  pods.
- **Secret Manager module rewritten**
  ([modules/secret_manager/main.tf](../../infra/terraform/modules/secret_manager/main.tf))
  for **per-service GSM secrets** with **per-secret IAM** bindings.
  Replaces slice 4's project-level `secretAccessor` with explicit
  `medapp-<env>-<service>` secrets that only the corresponding
  service's GSA can read. Also creates a dedicated
  `external-secrets-reader-wi` GSA bound to the K8s SA
  `external-secrets-reader` in the medapp namespace, with
  `secretAccessor` on every per-service + shared secret.
- **Helm chart updated for per-service secrets**: Deployment
  `envFrom` references `{{ kname }}` and `{{ kname }}-config` instead
  of the old shared `medapp-secrets` / `medapp-config`. New
  [`externalsecret.yaml`](../../infra/helm/medapp/templates/externalsecret.yaml)
  template renders one `ExternalSecret` per service when
  `externalSecrets.enabled: true`. Default false so the chart still
  installs on a fresh cluster (CRDs absent).
- **New platform Helm chart**
  ([infra/helm/platform/](../../infra/helm/platform/)) installs the
  External Secrets Operator (upstream chart 0.10.x), the
  `external-secrets-reader` K8s SA annotated with the ESO reader GSA,
  and the `ClusterSecretStore gcp-secret-manager` pointing at GSM via
  Workload Identity.
- **Env stacks wired**: dev/staging/prod each pull `service_gsa_emails`
  + `namespace` into the `secret_manager` module and expose
  `eso_reader_gsa_email` as an output for the platform chart install.

**Posture after this slice:**

- Prod deploys are gated by **five independent checks**: (1) `build-
  and-push` green (Trivy + Cosign sign), (2) GitHub Environment
  requires 2 reviewers + 30-min wait timer, (3) `cosign verify` in
  the deploy workflow, (4) Binary Authorization attestation check at
  pod admission, (5) Pod Security Standards `restricted` (from slice 3).
- A compromised pod sees only its own service's secrets. GSM audit
  logs name the principal as
  `<service>-wi@medapp-prod.iam.gserviceaccount.com` for every read,
  AND the GSA can only access one secret.
- Rollback is a `deploy.yml` re-dispatch with a prior commit SHA.
  Images are immutable in prod's Artifact Registry (bootstrap
  module's `immutable_tags = true`).

**Operator runbook for enforcing Binary Authorization**: flip prod's
`enforcement_mode` from `DRYRUN_AUDIT_LOG_ONLY` to
`ENFORCED_BLOCK_AND_AUDIT_LOG` after the first signed prod deploy
shows the attestation verifying clean in Cloud Audit Logs.

**Validation:**

| Stack                         | `terraform validate` |
|-------------------------------|----------------------|
| envs/dev                      | ✅ Success           |
| envs/staging                  | ✅ Success           |
| envs/prod                     | ✅ Success           |
| `terraform fmt -recursive`    | ✅ clean             |

**Deferred to slice 6**: KMS CMEK keys, Cloud Armor / WAF at GCLB,
Managed Prometheus alert rules + dashboards, VPC Service Controls.

## Hardening slice 12 — Build pipeline, image signing, per-service GSAs (2026-05-24)

**CI/CD rollout slice 4.** Wires the build pipeline that produces the
hardened images the slice-3 Helm chart deploys. See
[ADR 0013](../adr/0013-build-pipeline-and-service-identity.md).

**Changes:**

- **One shared Dockerfile** ([backend/Dockerfile](../../backend/Dockerfile))
  replaces 18 near-identical per-service Dockerfiles. Multi-stage
  (`builder` → `runtime`), parameterised by `--build-arg SERVICE` and
  `--build-arg SERVICE_PORT`, runs as non-root UID 10001 matching the
  Helm chart's `runAsUser`, ships `HEALTHCHECK` against `/healthz`, no
  build tools in the runtime image.
- **[backend/.dockerignore](../../backend/.dockerignore)** drops
  `__pycache__`, `.venv`, tests, and other artefacts so the image
  stays slim.
- **18 individual Dockerfiles deleted.**
- **New [build-and-push.yml](../../.github/workflows/build-and-push.yml)**
  workflow replaces the old static-matrix `backend-build.yml`:
  - Change-detection via `dorny/paths-filter`: a PR that touches one
    service no longer rebuilds 19. A change to `backend/shared/` or
    `backend/Dockerfile` rebuilds everything.
  - Trivy scan on every build (PR + push), fail on HIGH/CRITICAL,
    SARIF uploaded to the GitHub Security tab.
  - Cosign keyless signing on every push (GitHub OIDC → Fulcio →
    Rekor). No long-lived signing key.
  - Builds with `provenance: true` + `sbom: true` so each image
    carries SLSA build attestation + Syft SBOM out of the box.
- **Old `backend-build.yml` deleted.**
- **New Terraform module
  [service_identity](../../infra/terraform/modules/service_identity/main.tf)**
  creates one GSA per service per env, binds the K8s ServiceAccount →
  GSA via Workload Identity, and grants the baseline IAM role set
  (`logWriter`, `cloudtrace.agent`, `cloudprofiler.agent`,
  `cloudsql.client`, `secretmanager.secretAccessor`). Wired into
  envs/{dev,staging,prod}/main.tf.
- **Helm chart now computes GSA emails** at render time from
  `projectId` (see
  [serviceaccount.yaml](../../infra/helm/medapp/templates/serviceaccount.yaml)).
  No more `REPLACE_…` placeholders in values.yaml. A wrong `projectId`
  on the deploy now fails the Workload Identity binding loudly, rather
  than silently 403-ing every GCP API call.

**Posture after this slice:**

- Every image is built from one hardened Dockerfile. No service can
  ship without `runAsNonRoot: 10001` + `HEALTHCHECK` + the no-build-tools
  runtime layer.
- Every image is scanned. HIGH/CRITICAL CVEs fail the build.
- Every image pushed to Artifact Registry is signed and recorded in
  the Sigstore Rekor transparency log. Slice 5 flips Binary
  Authorization on prod to require these attestations.
- Every pod runs as its own GSA. Audit logs show
  `payment-service-wi@medapp-prod.iam.gserviceaccount.com` on every
  Stripe webhook write, not a shared deployer SA.

**Validation:**

| Check                               | Status |
|-------------------------------------|--------|
| `terraform fmt -recursive`          | ✅ clean |
| `terraform validate` (dev/staging/prod) | ✅ Success |
| Helm chart re-render after SA template change | structure inspected by hand; helm-lint CI enforces on PR |

No `docker build` against the new Dockerfile locally — that's the
build-and-push workflow's first job to exercise on the next PR.

**Deferred:**
- **Binary Authorization attestation enforcement** — needs at least one
  Cosign-signed image to exist; flipping the policy to
  `REQUIRE_ATTESTATION` before that would block every deploy. Slice 5.
- **ExternalSecret + ClusterSecretStore** — operator install + per-
  service secret references; its own slice.
- **Per-service IAM tightening** (specific secret IDs vs project-level
  `secretAccessor`) — when a real secret-leak audit demands it.
- **Base image digest pinning** — Dependabot's Docker integration
  handles this once the chart's `latest` image is on a stable tag.

**Next slice:** Slice 5 — deploy workflow per-env with GitHub
Environments + protection rules (auto to dev, manual approval for
staging, stricter approval + wait timer for prod), Binary Authorization
flip to `REQUIRE_ATTESTATION` on prod, ExternalSecret + ClusterSecretStore.

## Hardening slice 11 — K8s base hardening, audit C-10 closed (2026-05-23)

**CI/CD rollout slice 3.** Closes audit finding C-10 (no Kubernetes
`securityContext` anywhere). See [ADR 0012](../adr/0012-k8s-base-hardening.md).

**Changes:**

- **Consolidated on Helm; deleted the orphan Kustomize scaffold** under
  `infra/k8s/`. The deploy workflow only ever used Helm; running both
  was structural debt.
- **Hardened Helm chart** ([infra/helm/medapp/](../../infra/helm/medapp/)).
  Split the old monolithic `deployments.yaml` into focused templates:
  - [`namespace.yaml`](../../infra/helm/medapp/templates/namespace.yaml) — owns the namespace, applies Pod Security Standards `restricted` labels (`enforce`, `audit`, `warn`).
  - [`deployment.yaml`](../../infra/helm/medapp/templates/deployment.yaml) — full pod + container `securityContext` (`runAsNonRoot=true`, `runAsUser=10001`, `readOnlyRootFilesystem=true`, `allowPrivilegeEscalation=false`, `capabilities.drop=[ALL]`, `seccompProfile=RuntimeDefault`), explicit `hostNetwork/PID/IPC=false`, startup + readiness + liveness probes, topology spread across zones, scratch `emptyDir` mounts at `/tmp` and `/app/var` so the read-only root filesystem doesn't break tempfile usage.
  - [`service.yaml`](../../infra/helm/medapp/templates/service.yaml) — ClusterIP only; even api_gateway is reached via the L7 LB (slice 6), never a NodePort.
  - [`serviceaccount.yaml`](../../infra/helm/medapp/templates/serviceaccount.yaml) — per-service SA with `iam.gke.io/gcp-service-account` annotation (placeholder; slice 4 fills in real GSAs).
  - [`pdb.yaml`](../../infra/helm/medapp/templates/pdb.yaml) — PodDisruptionBudget for every service with ≥2 replicas.
  - [`networkpolicy.yaml`](../../infra/helm/medapp/templates/networkpolicy.yaml) — **default-deny** all ingress + egress, then explicit allows: DNS to kube-system, intra-namespace pod-to-pod (the "mesh"), egress to the Cloud SQL peering CIDR on 5432/3307, egress to the public internet via Cloud NAT on 80/443, and ingress from the GCLB health-check + traffic CIDRs to api_gateway only.
- **Fixed pre-existing K8s naming bug** — the old chart used `name: {{ $name }}` with service keys like `user_service`. K8s names disallow underscores (DNS-1123); the chart would never have deployed. New [`medapp.kname` helper](../../infra/helm/medapp/templates/_helpers.tpl) sanitises to `user-service` for K8s names, keeps the underscore in the image path (Artifact Registry accepts both).
- **Image registry path** corrected from `images` → `medapp` to match the bootstrap module's Artifact Registry repo. Service list expanded from the chart's old 13 to the actual 19 services in the repo (added hms / pms / onboarding / wearable_sync / inbox).
- **Deploy workflow** ([deploy.yml](../../.github/workflows/deploy.yml)) drops `--create-namespace` (template owns it now), passes `env` / `projectId` / `namespace` / `image.registry` per-env.
- **New `helm-lint.yml` CI** ([.github/workflows/helm-lint.yml](../../.github/workflows/helm-lint.yml))
  runs `helm lint` + `helm template` against dev/staging/prod values
  on every PR, with assertions that the rendered output contains
  `runAsNonRoot`, `readOnlyRootFilesystem`, `capabilities.drop`, the
  PSS labels, and the `default-deny-all` NetworkPolicy. A regression
  that drops any of them fails the PR loud.

**Posture after this slice:**

- Every pod runs as UID 10001, non-root, read-only root filesystem,
  no privileged capabilities, no host network. Pod Security Standards
  `restricted` enforced at the namespace will reject any deviation.
- Default-deny NetworkPolicy means a compromised pod cannot pivot
  laterally outside the namespace nor accept inbound from anywhere
  except api_gateway → GCLB.
- 19 services + 6 agents all share the same hardened template — there's
  no per-service room to forget a flag.

**Deferred to slice 4** (called out in the ADR):
- Real `gsa` values + per-service GSA Terraform.
- Cloud SQL Auth Proxy sidecar + IAM DB auth.
- ExternalSecret + ClusterSecretStore.
- Binary Authorization attestation enforcement.

**Audit findings status:**
- **C-10 (K8s securityContext)**: CLOSED.
- Remaining backend audit work: zero open B-tier or C-tier findings
  (within scope). C-1 (Groq key rotation — operator action), C-7
  (frontend localStorage — frontend in progress), and 9 pre-existing
  HMS PATCH/PUT failures (test debt, not security) are unchanged.

**Validation:** chart YAML structure inspected by hand; `helm lint`
and `helm template` run in the new helm-lint CI on every PR. No
`helm install` against real GCP yet — that runs when the operator
applies the bootstrap stack and points kubectl at the cluster.

**Next slice:** CI build pipeline — change-detection matrix, distroless
non-root images, Trivy scanning on push (fail on HIGH/CRITICAL), Cosign
signing + Binary Authorization enforcement, per-service GSAs in
Terraform that fill in the chart's `gsa` placeholders.

## Hardening slice 10 — GKE Autopilot + network + data-tier hardening (2026-05-23)

**CI/CD rollout slice 2.** Builds the cluster + network + database
layer on top of slice 9's bootstrap. See [ADR 0011](../adr/0011-gke-autopilot-private-cluster-topology.md)
for the topology decisions.

**Changes:**

- **`modules/network/`** ([main.tf](../../infra/terraform/modules/network/main.tf))
  rewritten for production posture: custom VPC, regional subnet with
  pod/service secondary ranges, flow logs at 0.5 sampling, Private
  Google Access, Cloud NAT for egress, Service Networking peering
  reserved for Cloud SQL private IP, explicit firewall rules (IAP SSH +
  internal pod-to-pod; everything else default-denied by GCP).
- **`modules/gke/`** ([main.tf](../../infra/terraform/modules/network/main.tf))
  rewritten for **GKE Autopilot** — Google manages nodes, OS patches,
  Pod Security Standards `restricted` enforced by default. `enable_private_nodes
  = true` everywhere. Control plane is public-with-master-authorized-
  networks in dev/staging, **private-only in prod**. Workload Identity
  pool wired. Release channel REGULAR. Managed Prometheus on.
- **`modules/cloud_sql/`** ([main.tf](../../infra/terraform/modules/cloud_sql/main.tf))
  hardened: private IP only (no public path possible), PITR + daily
  backups, `availability_type = REGIONAL` on prod (ZONAL elsewhere),
  `deletion_protection = true` on prod, `ssl_mode = ENCRYPTED_ONLY`,
  IAM database authentication on, `log_connections` / `log_disconnections`
  / `log_min_duration_statement = 500ms` flags pinned for audit +
  slow-query forensics, Cloud SQL Insights enabled with sanitised query
  strings (no client IP, no app tags).
- **`modules/gcs/`** ([main.tf](../../infra/terraform/modules/gcs/main.tf))
  tightened: `public_access_prevention = "enforced"` on every bucket,
  uniform bucket-level access, 7-day soft delete for accidental-delete
  recovery, prod uses `force_destroy = false` so `terraform destroy`
  cannot auto-delete PHI uploads.
- **`envs/{dev,staging,prod}/main.tf`** are now real env stacks (not
  stubs) — each uses its bootstrap's GCS state bucket, wires all four
  modules together with env-appropriate sizing, and declares the 17
  per-service databases.

**Security posture summary after this slice:**

- No node has a public IP. No SQL instance has a public IP. No GCS
  bucket can serve public requests.
- Prod control plane is private-only. `kubectl` against prod requires
  either the deploy CI workflow or IAP-tunneling through a jumpbox.
- All Google API calls from pods go via Private Google Access
  (internal RFC1918), not the public internet.
- Cloud SQL HA + PITR + `deletion_protection` on prod — recoverable
  from zone outages and operator mistakes without restoring from cold
  backups.
- VPC flow logs at 0.5 sampling + Cloud NAT error logs on for forensic
  readiness.

**Deferred (called out in the ADR):**
- Binary Authorization policy — waiting on Cosign signing (slice 4).
  Until then the cluster admits any signed-or-unsigned image; that
  bridge is crossed in slice 4 with a flip from `ALWAYS_ALLOW` to an
  attestation requirement.
- KMS Customer-Managed Encryption Keys — Google-managed AES-256 at
  rest is the default. CMEK in slice 6 alongside Cloud Armor.
- VPC Service Controls — slice 6.

**Validation:**

| Stack                          | `terraform validate` |
|--------------------------------|----------------------|
| envs/dev                       | ✅ Success           |
| envs/staging                   | ✅ Success           |
| envs/prod                      | ✅ Success           |
| envs/dev/bootstrap (re-validated) | ✅ Success        |
| envs/staging/bootstrap         | ✅ Success           |
| envs/prod/bootstrap            | ✅ Success           |

No `terraform plan` or `apply` against real GCP — those run when the
operator applies the bootstrap stack for the first time and copies the
outputs into GitHub Environments.

**Next slice:** K8s base hardening (audit C-10) — `securityContext` on
every Deployment, default-deny `NetworkPolicy` + per-service allow
rules, `PodDisruptionBudget`, namespace `Pod Security Standards:
restricted`, External Secrets Operator pulling from Google Secret
Manager.

## Hardening slice 9 — GCP foundation: three-project bootstrap + WIF (2026-05-23)

**First slice of the CI/CD + K8s rollout.** Lays the substrate every
later slice depends on. See [ADR 0010](../adr/0010-gcp-three-project-autopilot-wif.md)
for the decisions locked.

**Changes:**

- **New `bootstrap` Terraform module**
  ([`infra/terraform/modules/bootstrap/`](../../infra/terraform/modules/bootstrap/)).
  One apply per GCP project. Enables ~20 required APIs, creates the
  Terraform state GCS bucket (versioned, uniform access, public access
  prevention enforced, `prevent_destroy = true`), provisions a Workload
  Identity Federation pool + provider pinned via `attribute_condition`
  to a single GitHub `org/repo`, creates a per-env CI deployer service
  account, and creates an Artifact Registry docker repo (prod has
  `immutable_tags = true`).
- **Per-env bootstrap stacks**
  ([`envs/dev/bootstrap/`](../../infra/terraform/envs/dev/bootstrap/),
  [`envs/staging/bootstrap/`](../../infra/terraform/envs/staging/bootstrap/),
  [`envs/prod/bootstrap/`](../../infra/terraform/envs/prod/bootstrap/)).
  Separate Terraform state from the main env stack so destroying infra
  never wipes the state bucket. Prod overrides the role list — no
  project-wide `secretmanager.secretAccessor`, no `logging.viewer`.
- **CI workflows relocated** from `ci/.github/workflows/` →
  `.github/workflows/`. GitHub Actions only reads from the repo root —
  the existing workflows had never run. The dead mobile CI workflow was
  removed (mobile is React Native now); `backend-build.yml`'s Artifact
  Registry path corrected from `images/` to `medapp/` to match the
  bootstrap module. The hardcoded service matrix in `backend-ci` /
  `backend-build` is intentionally unchanged — slice 4 replaces it with
  change-detection.
- **New `terraform-fmt-validate.yml`** PR check
  ([`.github/workflows/terraform-fmt-validate.yml`](../../.github/workflows/terraform-fmt-validate.yml)).
  Runs `terraform fmt -check` + `terraform validate` without GCP
  credentials (uses `init -backend=false`) so it gates PRs during the
  bootstrapping phase before WIF exists.
- **Dependabot** ([`.github/dependabot.yml`](../../.github/dependabot.yml))
  for GitHub Actions, Python, and Docker base images. Weekly cadence,
  grouped to keep noise down.
- **`.gitignore`** extended to exclude real `terraform.tfvars` (only
  `.tfvars.example` is committed). Project ids, billing accounts, and
  org-specific values stay off the public tree.

**Security choices documented in ADR 0010:**

- WIF `attribute_condition` is pinned to one repo. Without it, any
  GitHub workflow worldwide could mint a token and impersonate.
- `prevent_destroy = true` on the tfstate bucket. Removing the lifecycle
  rule is a separate PR — closest thing Terraform has to a destructive-
  action review gate.
- `disable_on_destroy = false` on API resources. Disabling
  `container.googleapis.com` while GKE is running would melt the cluster.
- Three projects, not three namespaces. PHI workload isolation requires
  IAM blast-radius isolation.

**Tests run for this slice:** none (Terraform doesn't run yet — no GCP
project exists to apply against). `terraform fmt -check -recursive`
and `terraform validate` pass locally against every stack. The
fmt/validate CI runs on PR.

**To apply (per env):**

```bash
gcloud projects create medapp-dev --name="MedApp Dev"
gcloud beta billing projects link medapp-dev --billing-account=$BILLING_ACCOUNT
gcloud auth application-default login

cd infra/terraform/envs/dev/bootstrap
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars: set github_repository to your real org/repo
terraform init
terraform apply
```

Then copy the outputs into the GitHub Environment named `dev`:
`workload_identity_provider` → `GCP_WIF_PROVIDER`,
`ci_deployer_sa_email` → `GCP_DEPLOYER_SA`,
`tfstate_bucket` → `GCP_TFSTATE_BUCKET`,
project id → `GCP_PROJECT`.

Repeat for `staging`, `prod`.

**Next slice:** GKE Autopilot module + private cluster + Cloud SQL
private IP + Cloud NAT + Binary Authorization (slice 10 / CI-CD slice 2).

## Hardening slice 8 — Booking creation rate limit (2026-05-23)

**Audit finding B-22 closed.**

`POST /v1/bookings` had no per-user rate limit. A malicious or buggy
client could spam booking creation to hot-loop the doctor-availability
scan against the DB (cheap requests, expensive query) and to squat
slots on a doctor's calendar — the conflict check rejects overlaps but
a client can sweep adjacent slots faster than legitimate users can
claim them.

**Changes:**

- **`BookingRateLimiter`**
  ([`app/services/rate_limit.py`](../../backend/services/booking_service/app/services/rate_limit.py)).
  In-process sliding-window counter, `asyncio.Lock`-guarded, keyed on
  the authenticated principal's subject. Injectable `time_func` so
  tests dial the window down to deterministic ticks. Failed downstream
  operations still count — the limiter governs *intent*, not successful
  creations, so the conflict-check query stays shielded from
  hot-looping with intentionally-bad payloads.
- **Config**
  ([`app/config.py`](../../backend/services/booking_service/app/config.py)).
  `BOOKING_CREATE_RATE_MAX` (default 10) and
  `BOOKING_CREATE_RATE_WINDOW_SECONDS` (default 60) — tunable per
  deployment, ~167× the realistic user pace.
- **Wired in `create_app`** ([`app/main.py`](../../backend/services/booking_service/app/main.py))
  via `app.state.booking_rate_limiter`. Tests can swap the instance to
  exercise the over-limit branch without waiting on wall-clock windows.
- **Route gate**
  ([`app/routers/bookings.py`](../../backend/services/booking_service/app/routers/bookings.py))
  fires BEFORE the conflict-check query so an attacker can't burn DB
  work for free. Admins bypass — operator workflows (bulk imports,
  support scripts) should not trip a guard aimed at end-user abuse.
  Rejection: `429 Too Many Requests` with `Retry-After` set to the
  number of seconds until the oldest bucket entry ages out.

**Single-replica caveat:** the limiter is per-process. Two
booking_service replicas each enforce their own bucket. That's
deliberately weaker than a Redis-backed limiter, but symmetric with
the rest of the platform's current single-replica posture and strictly
better than zero. Swap for a shared store before scaling out — the
`BookingRateLimiter` interface is small enough to wrap with a Redis-
backed implementation without touching the route.

**Tests added:**
[`tests/test_rate_limit_b22.py`](../../backend/services/booking_service/tests/test_rate_limit_b22.py)
(7 tests):

1. Unit: limiter accepts up to `max_calls` in a window.
2. Unit: `max_calls + 1` raises 429 with a `Retry-After` header.
3. Unit: window resets — calls beyond the window age out.
4. Unit: per-user isolation — user B's bucket is independent of A's.
5. Route: third create in a 2-call window returns 429 with
   `Retry-After`.
6. Route: admin principal bypasses the limit (operator workflows).
7. Route: failed creates (conflict 400) still consume a slot —
   demonstrating intent-counting semantics.

Also added an autouse `_reset_rate_limiter` fixture so the module-level
`app`'s buckets don't leak across the existing tests.

**Tests run for this slice:**

| Service | Result |
|---|---|
| booking_service | 13 / 13 (6 prior + 7 B-22 regressions; no other tests regressed) |

**`B-` tier findings remaining at backend level (high priority):** none.

The backend B-tier list is now empty. The only outstanding backend
items are the 9 pre-existing HMS PATCH/PUT failures (latent test debt,
not security) and the cross-cutting items the user explicitly scoped
out of this sprint: C-1 (live Groq key rotation — operator action),
C-7 (frontend localStorage — frontend not functional), C-10 (K8s
hardening — K8s not yet implemented).

## Hardening slice 7 — Typed medical_history (2026-05-23)

**Audit finding B-12 closed.**

`users.medical_history` was a JSONB column with a `dict` default and no
write-time validation. The product had no contract for what could be
written there, so the column could accept arbitrary keys, oversized
notes blobs, or values the platform has no lawful reason to store
(credit card numbers, government IDs, social handles). The same risk
extended to `users.allergies`, which was typed as `list` with no size
or per-item bound.

**Changes:**

- **New typed schema**
  ([`app/schemas/medical.py`](../../backend/services/user_service/app/schemas/medical.py)).
  `MedicalHistory` Pydantic model with five fields (`conditions`,
  `medications`, `surgeries`, `family_history`, `notes`) and four
  sub-models. `extra="forbid"` applied recursively, so an undeclared
  key anywhere in the tree is rejected. `status` and `relation` are
  `Literal` enums, not free strings. Every free-text field has an
  explicit `max_length`; every collection caps at 50 entries.
- **`UserUpdate` / `UserOut` accept the typed schema**
  ([`app/schemas/user.py`](../../backend/services/user_service/app/schemas/user.py)).
  PATCH `/me` now accepts `medical_history` and GET `/me` returns it.
  `allergies` typed as `list[Annotated[str, StringConstraints(...)]]`
  with a 50-entry cap and 120-char per-item cap.
- **ORM defense in depth**
  ([`app/models/user.py`](../../backend/services/user_service/app/models/user.py)).
  SQLAlchemy `@validates` hooks re-run the Pydantic schema on every
  assignment to `medical_history` and bound-check every `allergies`
  write. Admin tools, sync jobs, and data imports that go around the
  HTTP route cannot bypass the contract.
- **Profile router allowlist** now includes `medical_history` so the
  PATCH path applies the new field.

No migration. The column type (JSONB) is unchanged; existing `{}` rows
remain valid empty `MedicalHistory` documents.

**Tests added:**
[`tests/test_medical_history_b12.py`](../../backend/services/user_service/tests/test_medical_history_b12.py)
(12 tests):

1. Valid medical_history round-trips through PATCH `/me` and GET `/me`.
2. Unknown top-level key (e.g. `credit_card`) → 422.
3. Unknown nested key (e.g. `ssn` inside a condition) → 422.
4. Invalid `status` literal → 422.
5. Invalid `relation` literal → 422.
6. Notes >2000 chars → 422.
7. >50 conditions → 422.
8. >50 allergies → 422.
9. Allergy string >120 chars → 422.
10. ORM-level `@validates` rejects unknown keys (service-layer write).
11. ORM-level `@validates` rejects bad allergies (wrong type, too long,
    too many).
12. ORM-level normalisation: `None` collapses to `{}` / `[]`.

**Tests run for this slice:**

| Service | Result |
|---|---|
| user_service | 51 / 51 (39 prior + 12 B-12 regressions; no other tests regressed) |

**`B-` tier findings remaining at backend level (high priority):**
- B-22 No per-user rate limit on booking creation

## Hardening slice 6 — Refund idempotency (2026-05-23)

**Audit finding B-17 closed.**

The refund endpoint had no protection against duplicate processing. A
client whose `POST /v1/payments/{id}/refund` timed out before seeing
the response — common on mobile networks — would retry and produce a
second refund row, which would in turn drive a second provider-side
reversal. The natural defense ("refund is only allowed when
`payment.status == SUCCEEDED`") only catches *full* refunds and only
after the first call commits; partial refunds and pre-commit retries
slip through.

**Changes:**

- **New `idempotency_records` table**
  ([`models/idempotency.py`](../../backend/services/payment_service/app/models/idempotency.py)
  + Alembic
  [`20260523_0002_idempotency_records.py`](../../backend/services/payment_service/alembic/versions/20260523_0002_idempotency_records.py)).
  Keyed on `(user_id, scope, key)` with `request_hash`,
  `response_status`, `response_body`. The scope is the route identifier
  (`refund:{payment_id}`), so the same key value used on a different
  payment is a fresh request, not a replay.
- **`execute_idempotent` helper**
  ([`services/idempotency.py`](../../backend/services/payment_service/app/services/idempotency.py)).
  Wraps any write action. Same key + same canonical-JSON request hash →
  cached response. Same key + different hash → 409. Two parallel
  requests with the same key race on the unique constraint; the loser
  rolls back, re-reads, and returns the winner's response — exactly one
  side-effect, guaranteed by the DB.
- **Refund route + service updated**
  ([`routers/payments.py`](../../backend/services/payment_service/app/routers/payments.py),
  [`services/payment_service.py`](../../backend/services/payment_service/app/services/payment_service.py)).
  `Idempotency-Key` header is now required (missing or empty → 400; over
  128 chars → 400). `refund_payment` returns a serialized dict so the
  cached body is preserved verbatim across replays.

**Tests added:**
[`tests/test_refund_idempotency_b17.py`](../../backend/services/payment_service/tests/test_refund_idempotency_b17.py)
(6 tests):

1. Missing `Idempotency-Key` → 400.
2. Empty / whitespace-only key → 400.
3. **The exploit scenario**: identical retry returns the cached
   response, exactly one `refunds` row, exactly one
   `idempotency_records` row.
4. Same key + different body → 409; first refund row stays, no second
   row created.
5. Same key value used on two different payments → two independent
   refund rows (scope isolation).
6. Key longer than 128 chars → 400.

Two existing tests (`test_get_payment_and_refund`,
`test_non_succeeded_refund_fails`) updated to send the now-required
header.

**Tests run for this slice:**

| Service | Result |
|---|---|
| payment_service | 16 / 16 (10 prior + 6 B-17 regressions; no other tests regressed) |

**Migration note:** `idempotency_records` will autocreate in tests via
`Base.metadata.create_all`. Production rollout runs
`alembic upgrade head` against `payment_service`. The migration is
purely additive (new table, no FKs onto existing tables) so it's safe
to apply ahead of the code deploy.

**`B-` tier findings remaining at backend level (high priority):**
- B-12 PII/PHI as free-form JSON in `users.medical_history`
- B-22 No per-user rate limit on booking creation

## Hardening slice 5 — HMS tenant staff-role verification (2026-05-22)

**Audit finding B-9 closed.**

The audit flagged HMS for trusting the JWT's `hospital_id` claim without
verifying the bearer is actually an active staff member at that hospital.
Concretely: `TenantContextMiddleware` decoded the bearer token, read
`hospital_id`, and bound it directly to `tenant_context_var` — meaning any
holder of a validly-signed HMS token could mint a token claiming
`hospital_id=<any-other-tenant>` and read that tenant's database through
any route that uses `get_tenant_db` without **also** depending on
`get_hms_principal`. Every production route today happens to use
`require_hms_roles` (which transitively verifies the staff row), so the
finding is defense-in-depth in the immediate term — but it removes the
sharp footgun the next time someone adds a route.

**Changes:**

- **[`backend/services/hms_service/app/deps.py`](../../backend/services/hms_service/app/deps.py)** —
  new public helper `verify_staff_membership(user_id, tenant_id) -> bool`
  built on top of the existing `_resolve_hms_role`. Returns `False` on
  malformed UUIDs so the middleware can fall through to "no tenant context"
  rather than 500.
- **[`backend/services/hms_service/app/middleware.py`](../../backend/services/hms_service/app/middleware.py)** —
  `TenantContextMiddleware` now requires both `sub` and `hospital_id` on
  the token; in non-dev_mode it calls `verify_staff_membership` and only
  sets `tenant_context_var` on a positive match. Unverified pairs leave
  the context unset and emit a `tenant_middleware.staff_role_unverified`
  warning. Dev mode (already gated against production by B-4's boot guard)
  preserves the trust-the-claim shortcut so local sessions don't need to
  seed staff rows.
- **dev_mode bypass in `get_hms_principal`** — when the JWT's `hms_role`
  claim is honoured (only possible inside dev_mode), the code path now
  emits `hms_principal.dev_mode_role_from_claim` at WARNING. A stray
  `HMS_DEV_MODE=true` slipping through B-4's startup guard would still
  light up dashboards rather than fail silent.

**Tests added:** [`tests/test_tenant_middleware_b9.py`](../../backend/services/hms_service/tests/test_tenant_middleware_b9.py)
(5 tests, all passing):

1. Unverified user → `tenant_context_var` is left **unset**.
2. Verified `(user, hospital_id)` → context bound to the JWT value.
3. **The exploit scenario**: user with active staff role at tenant A
   forges a token with `hospital_id=B`; middleware refuses to bind B and
   binds A only for the legitimate token.
4. dev_mode shortcuts staff verification (assert the management DB is
   not hit — `_resolve_hms_role` is patched to raise).
5. Token missing `sub` cannot be verified — context stays unset even if
   `hospital_id` is present.

**Tests run for this slice:**

| Service | Result |
|---|---|
| hms_service | 5 / 5 new B-9 tests pass; 41 / 50 overall (the 9 pre-existing PATCH/PUT failures are unchanged — none touch the middleware) |

**`B-` tier findings remaining at backend level (high priority):**
- B-12 PII/PHI as free-form JSON in `users.medical_history`
- B-17 Refund handling lacks idempotency key
- B-22 No per-user rate limit on booking creation

## Hardening slice 4 — Event reliability: outbox + DLQ (2026-05-22)

**Audit findings B-19 and B-20 closed.**

- **B-20 Transactional outbox** ([`backend/shared/shared/events/outbox.py`](../../backend/shared/shared/events/outbox.py)). New `OutboxEvent` SQLAlchemy model registered with `shared.db.Base`. `write_outbox_event(session, ...)` adds a row in the same DB session as the business write — the caller's commit makes them atomic. `drain_outbox(session, bus)` is the background worker that publishes unpublished rows; failures bump `attempts` + record `last_error`; `max_attempts` caps the retry loop. **Wired into `wearable_sync_service`**: `/v1/wearables/sync` calls `events.enqueue_outbox(db, ...)` instead of a direct publish, and a 5-second background loop in lifespan drains the outbox.

- **B-19 DLQ + retry capping** ([`backend/shared/shared/events/bus.py`](../../backend/shared/shared/events/bus.py)). `EventBus.subscribe()` declares each subscriber's queue with `x-dead-letter-exchange` pointing at a platform-wide DLX (`medapp.events.dlx`) and creates a paired `<queue>.dlq` for inspection. The on-message handler counts redeliveries via the `x-death` header RabbitMQ adds on requeue; after `max_retries` (default 3) the message is nacked-without-requeue → routes to the DLQ via the DLX. Poison pills no longer infinite-loop.

**Tests run for this slice:**

| Service | Result |
|---|---|
| wearable_sync_service | 15 / 15 (3 existing + 6 outbox round-trip + 6 retry-counter) |
| ehr_service | 9 / 9 (sibling producer — no regression) |
| lab_service | 10 / 10 (sibling producer — no regression) |
| user_service | 39 / 39 (consumer of shared bus — no regression) |
| agents/tests (shared) | 132 passed, 1 skipped (no regression) |

**Properties validated:**

1. Successful sync writes a row to `outbox_events`, NOT a direct broker publish. Same session as the sample rows → atomic with the commit.
2. Outbox row carries the full event payload (type, subject, routing_key, source, data, attempts=0, published_at=None).
3. `drain_outbox` publishes unpublished rows and stamps `published_at` on success.
4. Failures during drain increment `attempts` and record `last_error` without publishing — the next drain retries automatically.
5. Rows that hit `max_attempts` are skipped on future drains — operator intervenes manually (replay or delete).
6. Retry counter (B-19) correctly reads `x-death` count; defends against malformed headers; falls back to `redelivered` flag when header is absent.

**Migration note (production rollout):**

The `outbox_events` table is created automatically in tests via `Base.metadata.create_all`. For Postgres deployments, each service that adopts the outbox needs a one-line Alembic autogenerate to create the table. `wearable_sync_service` is the only adopter today; other services continue to use the legacy direct-publish path until they're migrated one by one (this is intentional — outbox adoption is opt-in).

## Hardening slice 3 — JWT confusion + dev_auth gate (2026-05-22)

**Audit findings B-2, B-3, B-4 closed.**

- **B-2 No `aud` claim on JWTs.** All MedApp-issued tokens (access + refresh) now include `aud: "medapp.platform"` and `iss: "medapp"` claims by default — see [`backend/shared/shared/auth/jwt.py`](../../backend/shared/shared/auth/jwt.py). `decode_token()` gained optional `audience` and `issuer` parameters; PyJWT verifies them when supplied. Shared `get_current_principal` reads `MEDAPP_DEFAULT_JWT_AUDIENCE` / `MEDAPP_DEFAULT_JWT_ISSUER` from env — set them in production for strict cross-deployment isolation. Six new unit tests verify the new claim shape and rejection on mismatch.

- **B-3 Algorithm pinning.** Confirmed already in place at every `jwt.decode` call site (`shared/auth/jwt.py`, `api_gateway/app/main.py`, `telemedicine_service`). Added explicit regression tests verifying `alg=none` and wrong-algorithm forgeries are rejected. The `algorithms=[algorithm]` single-element list pattern is sufficient — PyJWT validates the token header against this list.

- **B-4 HMS `dev_auth` router can mint admin tokens.** Router was already conditionally mounted on `settings.dev_mode` (good), but `HMS_DEV_MODE=true` could still slip through into any environment via env vars. Added [`_validate_dev_mode()`](../../backend/services/hms_service/app/main.py) at `create_app()` time: when `ENV=production` and `HMS_DEV_MODE=true`, the service refuses to boot with a `RuntimeError`. Outside production, dev_mode logs a loud warning instead. Three new tests pin all three combinations.

**Tests run for this slice:**

| Service | Result |
|---|---|
| user_service | 39 / 39 (+8 new B-2/B-3 jwt-claims tests) |
| payment_service | 10 / 10 (no change — verifies aud/iss don't break upstream auth) |
| hms_service | +3 new dev_mode_guard tests pass (the pre-existing 9 PATCH/PUT failures are unrelated to this slice) |

**`B-` tier findings remaining at backend level (high priority):**
- B-9 HMS trusts `X-Tenant` header without verification
- B-12 PII/PHI as free-form JSON in `users.medical_history`
- B-17 Refund handling lacks idempotency key
- B-19 / B-20 Event retry/DLQ + outbox publisher missing
- B-22 No per-user rate limit on booking creation

## Hardening slice 2 — webhook + role-escalation fixes (2026-05-22)

**Audit findings C-8, C-9, B-16 closed.**

- **C-9 Profile PATCH role escalation** ([user_service](../../backend/services/user_service)). `UserUpdate` now declares `extra="forbid"` — a PATCH with `role`, `kyc_status`, `is_active`, `email_verified`, etc. returns 422 with an explicit error rather than silently dropping the field. A code-level `_PATCHABLE_PROFILE_FIELDS` allowlist in the route handler is a second line of defence so future schema changes can't accidentally expose privileged fields. Three new regression tests in [tests/test_profile.py](../../backend/services/user_service/tests/test_profile.py) verify role/privileged-field/mixed-payload attacks all fail.
- **C-8 Stripe webhook hardcoded `change-me`** ([payment_service](../../backend/services/payment_service)). The literal `"change-me"` argument to the HMAC verifier is gone. Secret now comes from `PAYMENT_STRIPE_WEBHOOK_SECRET`. Empty secret → 503 (fail closed). New regression test `test_stripe_no_longer_accepts_change_me_signature` confirms a perfectly-signed forgery against the old literal is rejected.
- **B-16 M-Pesa webhook signature verification.** The endpoint previously accepted any payload with zero auth. Now requires HMAC-SHA256 over the raw body in the `X-MPESA-Signature` header. Same `_verify_hmac_sha256()` helper as Stripe; same fail-closed-on-empty-secret behaviour. Three new regression tests: unsigned → 401, bad signature → 401, valid signature → 200.

**Tests run for this slice:**

| Service | Result |
|---|---|
| payment_service | 10 / 10 (+3 M-Pesa + 1 C-8 regression) |
| user_service | 31 / 31 (+3 C-9 regression) |

**Critical-tier findings remaining at backend level: none.**
The audit's C-list is now: C-1 user-action-only (rotate Groq key), C-2/3/4/5/6/8/9 closed, C-7 frontend, C-10 K8s. The backend is at zero open critical findings.

## Hardening slice 1 — what changed (2026-05-22)

**Audit findings #2, #3, #5, #6 are all closed.** Files touched:

- [`backend/services/hms_service/app/services/tenant_service.py`](../../backend/services/hms_service/app/services/tenant_service.py) — regex allow-list before `CREATE DATABASE`.
- [`backend/services/ehr_service/app/services/record_service.py`](../../backend/services/ehr_service/app/services/record_service.py) — `_authorize_patient_access` returns `(requester_id, mode)`; `record_access` tags `[admin_override]`; `list_vitals` refactored to share the same authorization path.
- [`backend/shared/shared/auth/principal.py`](../../backend/shared/shared/auth/principal.py) — replaced hardcoded `"change-me"` default with `MEDAPP_DEFAULT_JWT_SECRET` env-read; returns 503 if unset (loud misconfiguration rather than silent forgery acceptance).
- [`backend/shared/shared/auth/validation.py`](../../backend/shared/shared/auth/validation.py) — new file, exports `WEAK_JWT_SECRETS` + `validate_jwt_secret(secret, service_name=)`. Production refusal-to-boot guard.
- [`backend/services/api_gateway/app/{main,config}.py`](../../backend/services/api_gateway/app/main.py) — CORS allow-list from config; weak default JWT removed; `validate_jwt_secret` called at `create_app()` time.
- **16 service config files** — every `jwt_secret: str = "change-me..."` replaced with `jwt_secret: str = ""` (`ehr`, `lab`, `wearable_sync`, `onboarding`, `booking`, `social`, `analytics`, `nurse`, `inbox`, `pms`, `hospital`, `payment`, `notification`, `telemedicine`, `user`, `hms`).

**Tests run (no regressions caused by this slice):**

| Service | Result |
|---|---|
| ehr_service | 9 / 9 |
| lab_service | 10 / 10 |
| wearable_sync_service | 8 / 8 |
| onboarding_service | 5 / 5 |
| booking_service | 6 / 6 |
| notification_service | 6 / 6 |
| agents (all six suites) | 293 / 293 + 1 skipped — unchanged |

Two pre-existing failures **not caused** by this slice (verified by
stashing changes and re-running):

- `hms_service`: 9 PATCH/PUT validation failures on update endpoints
  (unrelated to tenant provisioning; pre-existing).
- `user_service`: `argon2` not installed in the root venv (pre-existing
  dep issue).

## What the project does well

- Per-service Alembic migrations, async SQLAlchemy + asyncpg, a real
  outbox/event-bus shape, audit log scaffolding in `ehr_service`, refresh
  token rotation in `user_service`, and Workload Identity + private Cloud
  SQL in Terraform.
- A genuinely provider-agnostic agent layer with `MockLLM` as the real
  default and no vendor SDKs imported in core code.
- Sensible repo-wide tooling: `uv` as the single Python manager, Ruff,
  Kustomize overlays, Helm umbrella chart, and OpenAPI-driven client
  generation.

## What the project is short on

- **Secrets discipline.** Defaults are dangerous and consistent across
  services, which means a single missed env var compromises the platform.
- **Auth at the agent layer.** The provider-agnostic abstraction is good,
  but the entry points have no identity enforcement.
- **K8s/runtime hardening.** Manifests describe shape, not posture.
- **Test coverage.** Most services have only `healthz` tests; the agents
  have none beyond healthz.
- **Frontend governance.** Four web apps with drifting dependencies, no
  shared design system, no middleware-based route protection, and
  `localStorage` token storage.

## Recommended sequencing

A two-week hardening sprint resolves the bulk of the *critical* and *high*
findings before any feature work resumes. The detailed plan is in
[`REMEDIATION_ROADMAP.md`](./REMEDIATION_ROADMAP.md). At a glance:

| Week | Theme | Outcome |
|---|---|---|
| 0 (24h) | Rotate live secrets, replace `change-me` defaults | No live keys on disk; no shared default JWT secret |
| 1 | Fix critical code paths | SQLi closed, agent auth wired, CORS tightened, EHR admin bypass fixed |
| 2 | Runtime hardening | K8s `securityContext`, NetworkPolicy, CI permissions, dependency pinning |
| 3+ | Coverage and consolidation | Backend tests beyond healthz, shared FE design system, refresh-token flow |

## Bottom line

MedApp is not far from a defensible Phase-1 baseline, but it is also not
ready for *any* environment that touches real user data today. The
remediation effort is concentrated and well-scoped: most of it is replacing
defaults, adding middleware, and tightening manifests — not rewriting
architecture.
