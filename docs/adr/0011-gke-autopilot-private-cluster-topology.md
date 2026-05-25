# ADR 0011 — GKE Autopilot private cluster, Cloud SQL private IP, VPC layout

- **Status**: Accepted
- **Date**: 2026-05-23

## Context

Slice 2 of the CI/CD rollout had to lock the network + data-tier
topology. The decisions made here shape everything in slices 3-6 (K8s
manifests must work with private nodes; secrets have to be reachable
over the private path; ingress in slice 6 has to terminate before the
private cluster).

The constraints:

- PHI workloads — no service or database should have a public IP.
- Single-operator team — every layer of "complexity for completeness"
  costs more than it's worth.
- Three GCP projects per ADR 0010 — each env has its own VPC, its own
  state, its own peering.

## Decision

### One regional VPC per env, custom subnets only

Auto-mode VPCs create subnets in every region with permissive default
firewall rules. We opt out — one VPC per env, one regional subnet, two
secondary ranges (`pods` /16, `services` /20). VPC flow logs at 0.5
sampling for forensic readiness without excessive Cloud Logging cost.

### Cloud NAT, no public node IPs

Nodes have no external IP — that's the `enable_private_nodes = true`
flag on the cluster. Egress (pulling base images from public registries,
calling external APIs) goes through Cloud NAT. Private Google Access
on the subnet keeps Google API calls (Artifact Registry, Secret Manager,
Cloud Logging) on the internal RFC1918 path.

### Service Networking peering for Cloud SQL

Cloud SQL "private IP" is implemented as a VPC peering with Google's
managed service VPC. A `/16` is reserved inside our VPC and the peering
makes Google's SQL instance addressable from our subnets. `ipv4_enabled
= false` on the SQL instance closes the public path entirely.

### Master endpoint: public in dev/staging, private in prod

Dev/staging have a public control plane endpoint, but only IPs listed
in `master_authorized_cidrs` can reach it. That keeps the operator's
`kubectl` ergonomics workable without exposing the API to the world.

Prod has `enable_private_endpoint = true` — the control plane is only
reachable from inside the VPC. To run kubectl against prod, an operator
either:
- runs commands via the deploy GitHub Action (the path we use 99% of
  the time), or
- IAP-tunnels through a jumpbox in the VPC.

This is the single biggest "you can't accidentally typo a destructive
command against prod from a laptop" lever GCP offers.

### Cloud SQL hardening

- Private IP only (per above).
- PITR + automated daily backups in every env. 30-day retention in prod,
  7 in dev/staging.
- `availability_type = REGIONAL` in prod (multi-zone failover), `ZONAL`
  elsewhere — doubles the cost so we only pay for it where uptime
  matters.
- `deletion_protection = true` in prod.
- `ssl_mode = ENCRYPTED_ONLY` + IAM database authentication enabled —
  pods authenticate as their Workload Identity SA, no static passwords.
- Database flags pin `log_connections`, `log_disconnections`, and
  `log_min_duration_statement = 500ms` for audit + slow-query forensics.
- Cloud SQL Insights on with sanitised query strings (no client IP,
  no app tags).

### Binary Authorization deferred

The audit findings sprint flagged unsigned container images as a future
risk. Slice 4 wires Cosign signing into the build pipeline; once images
are signed, the Binary Authorization policy switches from
`ALWAYS_ALLOW` (the implicit current state) to an attestation
requirement. Adding the policy resource now without the signing
pipeline would either block all deploys or be theatre — defer.

### KMS CMEK deferred

Customer-Managed Encryption Keys on Cloud SQL, GCS, and Artifact
Registry are valuable for regulatory posture but add a key-rotation
operational surface that doesn't pay for itself before product-market
fit. Slice 6 (alongside Cloud Armor) revisits CMEK; until then we rely
on Google's default encryption-at-rest (which is still AES-256 with
Google-managed keys — strong, just not customer-controlled).

## Consequences

**Good:**
- No node has a public IP. No SQL instance has a public IP. No GCS
  bucket can serve public requests.
- Prod control plane is private — accidental destructive `kubectl`
  from a laptop is impossible without effort.
- Cloud SQL HA + PITR + deletion_protection on prod means we can
  recover from operator mistakes or zone outages without restoring
  from cold backups.
- Autopilot's baseline (shielded nodes, Pod Security Standards
  `restricted`, no root containers, no privileged hostPath) is enforced
  by the platform — slice 3 manifests have a smaller surface to harden
  because the cluster refuses to admit unsafe pods.

**Bad:**
- IAP tunneling to reach prod's kubectl is slower than `gcloud get-credentials`.
  Acceptable — production access shouldn't be frictionless.
- Cloud NAT is a per-second-per-VM cost. Negligible at this scale.
- `availability_type = REGIONAL` on prod Cloud SQL roughly doubles the
  SQL bill. The PHI uptime requirement justifies it.
- Adding a new service that needs a public ingress requires routing
  through the L7 load balancer in slice 6, not exposing a node port.
  Intended.

**Out of scope of this ADR:**
- VPC Service Controls (slice 6, alongside Cloud Armor).
- Multi-region disaster recovery — not on the roadmap until PMF.
- Per-pod CMEK with KMS auto-rotation — slice 6.
