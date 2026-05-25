# ADR 0013 — Shared Dockerfile, change-detection build, Cosign signing, per-service GSAs

- **Status**: Accepted
- **Date**: 2026-05-24

## Context

Slice 4 of the CI/CD rollout wires the build pipeline. Before this
slice every backend service carried its own near-identical Dockerfile
(18 files that differed only in service name + port), the build
workflow always rebuilt every service on every push regardless of what
changed, there was no vulnerability scan, images were unsigned, and
the Helm chart's `gsa` field carried `REPLACE_…` placeholders pointing
at GSAs that didn't exist.

## Decision

### One shared Dockerfile, parameterised by build arg

`backend/Dockerfile` is the single source of truth. The build workflow
passes `--build-arg SERVICE=<name> --build-arg SERVICE_PORT=<port>`.
Per-service Dockerfiles deleted (18 files).

Multi-stage: a `builder` stage with `uv` resolves and installs into a
prefixed tree; the `runtime` stage starts fresh, copies only the
installed tree, adds a `curl` for healthcheck (and only that), creates
the non-root user matching the Helm chart's `runAsUser: 10001`, and
sets `HEALTHCHECK` against `/healthz`.

**Why one Dockerfile, not a `Dockerfile.base` + 18 thin wrappers**:
either pattern centralises the hardening, but a single file with
build-args is one fewer file to forget when reviewing. The diff cost
("which service's Dockerfile changed") is replaced by `git log -- backend/Dockerfile`.

**Why a `sh -c` CMD**: the service port comes from a build-arg expanded
into an env var, and JSON exec form can't substitute env vars. The
`exec uvicorn ...` inside the shell wrapper still hands PID 1 to
uvicorn so SIGTERM propagates correctly.

### Change-detection build matrix

`dorny/paths-filter` reads each service's path filter and the workflow
matrix builds only the services that actually changed. A change to
`backend/shared/` or `backend/Dockerfile` itself rebuilds everything.

**Why not always rebuild everything**: 19 services × ~2 minutes per
build = ~40 minutes for a one-line PR. Cache-of-cache layers helps but
doesn't eliminate the time floor. Change detection is the right
default; the "rebuild all" trigger is one path filter away when
genuinely needed.

### Trivy fail-on-HIGH-or-CRITICAL

Every build (PR or main) scans the rendered image with Trivy. HIGH or
CRITICAL CVE → job fails. SARIF uploaded to the GitHub Security tab
so findings are visible without rerunning the workflow.

**Why HIGH not MEDIUM**: medium-severity CVEs in transitive Python
deps would flake the build constantly. The bar is calibrated to "the
CVE has a known exploit path or is broadly exploitable" — HIGH and
CRITICAL fit that, MEDIUM mostly doesn't.

**Why `ignore-unfixed: true`**: a CVE without a patch is something
Trivy can't help us with — flagging it just creates noise.

### Cosign keyless signing

Every image pushed to Artifact Registry is signed via Cosign keyless
flow: GitHub OIDC → Fulcio (ephemeral cert) → Rekor (transparency
log). No long-lived signing key lives anywhere.

Slice 5 will switch Binary Authorization on prod from `ALWAYS_ALLOW`
to `REQUIRE_ATTESTATION` so the cluster refuses any image that
Cosign-Rekor cannot verify. We don't flip the policy in this slice
because we'd block all deploys until at least one image is signed —
chicken-and-egg.

### Per-service Google Service Accounts via Terraform

New `service_identity` module creates one GSA per service per env,
binds the K8s ServiceAccount → GSA via Workload Identity, and grants a
baseline IAM role set: `logWriter`, `cloudtrace.agent`,
`cloudprofiler.agent`, `cloudsql.client`, `secretmanager.secretAccessor`.

The GSA email is fully deterministic from the service key + project id
(`<kname(service)>-wi@<project>.iam.gserviceaccount.com`), so the Helm
chart computes it at render time rather than carrying placeholder
values that needed 19 `--set` flags per deploy.

Per-service extras (e.g. `payment_service` needing
`roles/pubsub.publisher`) go through `extra_roles` map in the env stack.
None are wired today — when a service actually needs an extra role,
the env stack PR is the audit trail.

**Why baseline + extras, not "explicit per service"**: the baseline is
five roles every Python FastAPI service in our stack needs (write
logs, write traces, profile itself, talk to its DB, read its secrets).
Listing it explicitly for every service is 95 lines of HCL with one
real degree of freedom; the abstraction earns its keep.

**Why no Binary Authorization in this slice**: see Cosign section above.

## Consequences

**Good:**
- One Dockerfile to harden, not 18. A future "add a SAST step here"
  change is a single PR.
- Build time on a one-service PR drops from 19× to 1×.
- Trivy catches known CVEs before they hit prod; Cosign + Rekor make
  every prod image traceable to a specific commit + workflow run.
- Per-service GSAs mean the audit log shows
  `principal: payment-service-wi@medapp-prod.iam.gserviceaccount.com`
  on every Stripe webhook write, not a generic deployer SA.
- The Helm chart's serviceaccount.yaml no longer carries placeholder
  strings — the GSA email is computed from `projectId`, so a Helm
  install with the wrong projectId now fails at the Workload Identity
  binding (the K8s SA's GSA annotation won't match any real GSA),
  surfacing the misconfiguration loudly.

**Bad:**
- Change-detection adds a `detect` job that's always 30 seconds of
  ceremony even when nothing changed. Acceptable.
- The `sh -c` CMD form means the service binary is the second process
  in the container, not the first. We `exec` to swap, so SIGTERM is
  fine, but `docker inspect` shows `sh` as the entrypoint.
- Trivy on every PR is ~30s per service. Acceptable; the alternative
  is shipping known CVEs.
- Per-service GSA proliferation: 19 services × 3 envs = 57 GSAs. GCP
  IAM has no hard limit at this scale but the Cloud Console gets
  busy. Acceptable.

**Out of scope:**
- Binary Authorization attestation enforcement → slice 5.
- ExternalSecret + ClusterSecretStore → slice 5.
- Per-service IAM tightening (specific secret IDs instead of project-
  level secretAccessor) → when a real secret-leak audit demands it.
- Image base updates pinned to digest (vs `python:3.12-slim` floating
  tag) → Dependabot Docker integration takes care of this.
