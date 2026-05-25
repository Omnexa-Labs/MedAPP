# ADR 0010 — Three GCP projects, GKE Autopilot, GitHub WIF

- **Status**: Accepted
- **Date**: 2026-05-23

## Context

MedApp handles PHI for patients across Ghana, Nigeria and Kenya. We're
about to provision the first cloud infrastructure. Three orthogonal
decisions had to be locked together because each shapes the others:

1. How do we isolate `dev` from `staging` from `prod` on GCP — namespaces
   in one project, or three separate projects?
2. Which GKE flavour — Autopilot or Standard?
3. How does CI authenticate to GCP — JSON key files or Workload Identity
   Federation?

## Decision

**Three GCP projects** (`medapp-dev`, `medapp-staging`, `medapp-prod`),
**GKE Autopilot** in each, and **Workload Identity Federation** for
GitHub Actions.

### Three projects, not one with namespaces

Strongest blast-radius isolation available on GCP:

- IAM is per-project. A team member granted `roles/editor` on `medapp-dev`
  cannot read prod data; with namespaces, the same role grant gives access
  to every environment.
- Billing is per-project. A runaway dev job cannot consume the prod budget
  quota.
- Audit logs are per-project — easier to satisfy regulator requests scoped
  to "prod data" without filtering noise.
- Service quotas (e.g. Cloud SQL instances per project) are per-project.
  A dev experiment cannot starve prod.

The cost is admin overhead: three Terraform states, three sets of APIs
to enable, three sets of GitHub Environment secrets. We accept that —
the audit findings sprint demonstrated how cheap a single misconfigured
default can be.

**Rejected**: one project, three namespaces. Acceptable for hobby
projects; not defensible for PHI.

### GKE Autopilot, not Standard

Google manages nodes, OS patching, autoscaling, and a security baseline
(shielded nodes, secure boot, restricted privileged containers, Pod
Security Standards `restricted` enforced by default). We pay per-pod
resources, not per-node. For a single-operator team building the first
deployment, this removes a class of toil and a class of misconfiguration:
we cannot accidentally run unpatched nodes or grant root privileges to a
pod the platform refuses to admit.

The trade-off: less node-level control. Specifically, the existing
GPU node pool in `modules/gke/main.tf` (intended for the lab_reader
agent) does not move cleanly. Autopilot supports GPU pods via
nodeSelector + accelerator type without an explicit pool, so the
agent path stays usable; if we later need a dedicated GPU cluster for
training workloads, we'll provision a separate Standard cluster — not
mix flavours in one cluster.

**Rejected**: GKE Standard. The existing Terraform module already
points at Standard but it's shape-only — no shielded nodes, no private
cluster, no Binary Authorization, no NetworkPolicy provider configured.
Building all of that ourselves to reach the same baseline Autopilot
gives by default is wasted effort.

### Workload Identity Federation, not JSON keys

GitHub Actions mints short-lived OIDC tokens, GCP exchanges them for
short-lived access tokens via WIF. No long-lived credential ever lands
on a CI runner. The provider's `attribute_condition` pins the binding
to a single `org/repo` pair so a token from a fork or unrelated org
cannot impersonate the deployer SA.

**Rejected**: JSON service account keys stored in GitHub Secrets. They
are long-lived, leakable, and a known attack vector (the Codecov 2021
breach is one well-documented example).

## Consequences

**Good:**
- Hard environment isolation by default.
- Autopilot security baseline (no root containers, no privileged hostPath,
  no shared host network) lifted to the platform — cannot be forgotten
  by an engineer writing a manifest in a hurry.
- WIF means rotating a CI credential is a Terraform change, not a
  scramble through GitHub Secrets after a key leaks.
- The `medapp-tfstate` bucket per project is co-located with the
  workloads whose state it tracks; deleting the project deletes its own
  state file (intentional — no orphaned state from a deleted env).

**Bad:**
- Three projects = 3× Terraform overhead, 3× the API enablement,
  3× GitHub Environment secret sets. Mitigated by the `bootstrap` module
  being shared across all three.
- Autopilot's per-pod billing is more expensive than packing a Standard
  cluster's nodes to 80%. For a single replica per service that gap is
  ~$50-100/month per env at our scale — acceptable for the operational
  reduction.
- Autopilot enforces the security baseline whether we want it or not.
  A pod that needs `CAP_NET_RAW` or hostPath access (we don't have any
  today) would need a Standard cluster. We accept the constraint.

**Out of scope of this ADR (deferred):**
- KMS Customer-Managed Encryption Keys on the tfstate bucket + Cloud SQL
  + GCS uploads. Slice 2.
- Cloud Armor / WAF on the API gateway ingress. Slice 6.
- Multi-region disaster recovery. Not on the roadmap until product-market
  fit.
