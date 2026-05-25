# MedApp Helm chart

Single umbrella chart that renders Deployments, Services, ServiceAccounts,
PodDisruptionBudgets, and NetworkPolicies for every backend service and
agent. One chart, three deployments — `env`/`projectId`/`namespace` set
at install time via `--set`.

## What it ships

| Kind                    | Per service | Notes                                       |
|-------------------------|-------------|---------------------------------------------|
| `Namespace`             | 1           | Pod Security Standards `restricted` labels  |
| `Deployment`            | yes         | `securityContext`, startup/readiness/liveness probes, readOnlyRootFilesystem with /tmp + /app/var emptyDirs |
| `Service`               | yes         | ClusterIP only                              |
| `ServiceAccount`        | yes         | Workload Identity annotation (placeholder)  |
| `PodDisruptionBudget`   | yes (≥2 replicas) | Single-replica services skip the PDB  |
| `NetworkPolicy`         | 5 + 1/exposed | Default-deny + DNS + intra-namespace + Cloud SQL + internet + GCLB-to-api_gateway |

## Hardening summary (audit C-10)

Every pod that the chart renders has:

- `runAsNonRoot: true`, `runAsUser: 10001`, `runAsGroup: 10001`, `fsGroup: 10001`
- `seccompProfile.type: RuntimeDefault`
- `allowPrivilegeEscalation: false`
- `readOnlyRootFilesystem: true` (with two scratch `emptyDir` mounts for `/tmp` + `/app/var`)
- `capabilities.drop: [ALL]`
- `hostNetwork: false`, `hostPID: false`, `hostIPC: false`

The Pod Security Standards `restricted` profile is enforced at the
namespace, so any pod that softens these is rejected by the admission
controller — defence in depth behind the container-level settings.

NetworkPolicy default-denies all ingress and egress. The chart opens
exactly:
- DNS to kube-system
- Pod-to-pod within the namespace
- Egress to the Cloud SQL peering CIDR on 5432 / 3307
- Egress to the public internet via Cloud NAT on 80/443 (Cloud Armor in slice 6 will tighten this)
- Ingress to `api_gateway` only, from the GCLB health-check + traffic source CIDRs

## Install

The deploy workflow handles this; for local rendering:

```bash
helm template medapp infra/helm/medapp \
  --set env=dev \
  --set projectId=medapp-dev \
  --set namespace=medapp-dev \
  --set image.registry=europe-west1-docker.pkg.dev/medapp-dev/medapp \
  --set image.tag=v0.1.0 | less
```

## Service naming

Backend service directory names use underscores (`user_service`) because
they're Python module identifiers. K8s resource names disallow
underscores. The `medapp.kname` helper maps `user_service` → `user-service`
for every metadata.name field. Image paths keep the underscore (Artifact
Registry accepts both).

## What's intentionally NOT in this chart

These are slice 4+ work:

- **`ExternalSecret` resources** projecting per-service Secrets from
  Google Secret Manager. Today the chart references `medapp-secrets` /
  `medapp-config` with `optional: true` — pods boot even without them.
- **Cloud SQL Auth Proxy sidecar** for IAM-DB-authenticated SQL access.
  The NetworkPolicy already allows the 3307 egress; the sidecar
  configuration comes when each service gets its own GSA.
- **Real `gsa` values** — the placeholders won't authenticate to
  anything. Pods start; calls to GCP APIs 403. Slice 4 fills them in.
- **Cloud Armor / WAF** at the GCLB level (slice 6).
- **Binary Authorization** attestation requirement (slice 4).
