# ADR 0012 — K8s base hardening: PSS restricted, NetPol default-deny, Helm consolidation

- **Status**: Accepted
- **Date**: 2026-05-23

## Context

Slice 3 of the CI/CD rollout closes audit finding **C-10** (no
Kubernetes `securityContext` anywhere) and removes a structural debt:
the repo carried both a Kustomize scaffold (`infra/k8s/`) and a Helm
chart (`infra/helm/medapp/`) that templated the same shape with
different bugs. The deploy workflow only ever used the Helm chart;
Kustomize was orphaned.

## Decision

### Three things at once:

1. **Consolidate on Helm. Delete the Kustomize scaffold.**
2. **Rewrite the Helm chart with full hardening** — `securityContext` at
   pod and container level, Pod Security Standards `restricted` at the
   namespace, NetworkPolicy default-deny + minimum-needed allows, per-
   service ServiceAccount with the Workload Identity annotation.
3. **Helm template owns the namespace** so the PSS labels apply
   consistently — the deploy workflow drops `--create-namespace`.

### Why consolidate, not run both

Two YAML scaffolds rendering near-identical resources is debt. One had
to win; the deploy workflow already used Helm, so Kustomize lost.
Re-introducing Kustomize for env-specific overrides is possible later
if Helm's `--set` story gets unwieldy — but the chart's `env` field +
`--set` covers everything dev/staging/prod differs on today.

### Why PSS `restricted` at the namespace, not just `baseline`

`baseline` (the lighter profile) still allows `runAsUser: 0`,
`hostPath` volumes if explicitly allowed, and a handful of capabilities
including `NET_BIND_SERVICE`. None of our services need any of that.
`restricted` rejects them entirely, which means a regression that
introduces an unsafe pod fails admission rather than running with
weakened isolation.

### Why default-deny NetworkPolicy + a permissive intra-namespace rule

True zero-trust (every service has an explicit allow list of which
other services may call it) requires us to enumerate the call graph
across 19 services × 6 agents. We'd be guessing — getting it wrong
means false-positive 403s in production. The chosen middle:

- Default-deny at the namespace level
- Allow all pod-to-pod inside the namespace (the "mesh")
- Allow only DNS, Cloud SQL, GCLB ingress to api_gateway, and public
  internet (via Cloud NAT) outside the namespace

That gives audit C-10's wins (compromised pod cannot pivot to
unprivileged egress destinations, cannot accept inbound from
anywhere except the namespace + GCLB-to-gateway) without overfitting
to a service-to-service map that changes as features ship. Per-service
tightening can be layered on later without removing this baseline.

### Why Cloud SQL Auth Proxy + ExternalSecret are deferred

Both require per-service Google Service Accounts with explicit IAM
bindings. The Helm chart's `gsa` placeholder is ready for them; slice
4 wires the Terraform that creates the GSAs and the IAM bindings, and
fills the placeholders in.

Until slice 4, pods can start (the chart references
`medapp-config` / `medapp-secrets` with `optional: true`) but
authenticated calls to GCP APIs return 403. That's acceptable for the
period between slice 3 and slice 4.

## Consequences

**Good:**
- Audit C-10 closed. Every pod that the chart renders satisfies the
  full restricted profile at both the container and namespace levels.
- One scaffold, not two. No more drift between Kustomize and Helm.
- Image registry references aligned with the bootstrap module's
  Artifact Registry repo (`medapp`, not the old `images` placeholder).
- Service list includes all 19 services that exist in the repo (the
  old chart listed only 13).
- Service naming bug fixed (`user_service` was an invalid K8s name
  under DNS-1123; `medapp.kname` helper sanitises).

**Bad:**
- `helm install` doesn't render the namespace until first apply, so
  the namespace template has to land before any other resource. Helm's
  ordering does this correctly for first install but on `helm upgrade`
  if you somehow drop the namespace separately, the upgrade fails.
  Operator runbook covers this — production runbooks come in slice 6.
- Read-only root filesystem + scratch emptyDirs requires the app code
  to write only under `/tmp` or `/app/var`. Existing services
  (`hms_service`, `wearable_sync_service`) all write to in-memory
  SQLite during tests and log to stdout — none write to disk in prod.
  If a future service needs persistent writes, it needs a
  PersistentVolumeClaim, not a writable root.
- Single-replica agent services (`smart_recommend_agent`, etc.) get no
  PDB protection — full disruption during maintenance is acceptable
  for now because the agent layer is stateless and re-routable. When
  they need uptime guarantees, bump `replicas: 2` in values.yaml.

**Out of scope:**
- Cloud SQL Auth Proxy sidecar + per-service GSA bindings → slice 4.
- ExternalSecret + ClusterSecretStore → slice 4.
- Binary Authorization attestation enforcement → slice 4 (depends on
  Cosign signing).
- Cloud Armor / WAF at GCLB → slice 6.
- Service mesh (mTLS, per-service AuthorizationPolicies) → not on the
  roadmap until clear need.
