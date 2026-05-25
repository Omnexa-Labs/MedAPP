# Terraform — Google Cloud

```
terraform/
  modules/
    bootstrap/         Per-project substrate: APIs, tfstate bucket, WIF, deployer SA, AR
    network/           VPC, subnets, firewall, Cloud NAT       (slice 2)
    gke/               GKE Autopilot regional cluster          (slice 2 — currently Standard)
    cloud_sql/         Postgres HA + PITR + private IP         (slice 2)
    gcs/               Buckets (uploads, mlflow artifacts)
    secret_manager/    Secrets + IAM bindings
  envs/
    dev/
      bootstrap/       Bootstrap stack — apply first, locally.
      main.tf          Main env stack — uses gcs backend in <project>-tfstate.
    staging/
      bootstrap/
    prod/
      bootstrap/       Tighter CI deployer roles than dev/staging.
```

We run three isolated GCP projects: `medapp-dev`, `medapp-staging`,
`medapp-prod`. Each has its own Terraform state, its own Workload Identity
Federation pool, and its own CI deployer service account. Blast radius from a
misconfigured IAM in dev cannot reach prod data.

See [`docs/adr/0010-gcp-three-project-autopilot-wif.md`](../../docs/adr/0010-gcp-three-project-autopilot-wif.md)
for the decision record behind this layout.

---

## First-time bootstrap (per environment)

The state bucket lives inside the project, which is a chicken-and-egg
problem: the bucket doesn't exist until Terraform applies, but Terraform
normally needs a backend. The bootstrap stack solves this by using a
LOCAL backend.

```bash
# 1. Create the GCP project. (One-time, requires Org Admin / Project Creator.)
gcloud projects create medapp-dev --name="MedApp Dev"
gcloud beta billing projects link medapp-dev --billing-account=$BILLING_ACCOUNT

# 2. Authenticate locally as a user with Project Owner on medapp-dev.
gcloud auth application-default login

# 3. Apply the bootstrap stack.
cd infra/terraform/envs/dev/bootstrap
cp terraform.tfvars.example terraform.tfvars
# → edit terraform.tfvars: set github_repository to your real org/repo
terraform init
terraform apply
```

Apply outputs three values you copy into the matching GitHub Environment
(`Settings → Environments → dev` on the repo):

| Output                       | GitHub Environment secret name |
|------------------------------|--------------------------------|
| `workload_identity_provider` | `GCP_WIF_PROVIDER`             |
| `ci_deployer_sa_email`       | `GCP_DEPLOYER_SA`              |
| `tfstate_bucket`             | `GCP_TFSTATE_BUCKET`           |

The project id (`medapp-dev`) goes into `GCP_PROJECT`.

Repeat for `staging` and `prod`.

### Where bootstrap state lives

Local-only. The state file is `infra/terraform/envs/<env>/bootstrap/terraform.tfstate`
and **is gitignored**. Bootstrap rarely changes; the operator who applies
it keeps the state on their workstation. Production teams with multiple
operators should move bootstrap state to a dedicated "ops" project's GCS
bucket — that's outside the scope of this repo for now.

---

## Main env stack

After bootstrap is applied:

```bash
cd infra/terraform/envs/dev
cp terraform.tfvars.example terraform.tfvars
# → edit if you want kubectl from your laptop to reach the control plane
terraform init
terraform plan
terraform apply
```

What it provisions (see [ADR 0011](../../docs/adr/0011-gke-autopilot-private-cluster-topology.md)):

- Private VPC + regional subnet + Cloud NAT + Service Networking peering
- **GKE Autopilot** regional cluster, private nodes, control plane
  public-with-master-authorized-networks in dev/staging / private-only
  in prod
- **Cloud SQL Postgres 16** — private IP only, PITR, IAM auth, prod is
  HA + `deletion_protection`. One database per backend service.
- Two GCS buckets per env: `<project>-uploads` (versioned, public
  access prevention enforced, 7-day soft delete) and `<project>-mlflow`.
- Secret Manager secret stubs (per-secret IAM bindings come from slice 3).

After `terraform apply` succeeds, copy the outputs:
`cluster_name`, `cluster_location`, `sql_instance_connection`,
`uploads_bucket` — slice 3 will reference these in the K8s manifests
and Helm values.

---

## What the bootstrap module gives you

- **APIs enabled** (~20 services) — `container`, `sqladmin`, `secretmanager`,
  `artifactregistry`, `binaryauthorization`, `cloudkms`, `compute`, `monitoring`,
  `logging`, `cloudtrace`, etc. `disable_on_destroy = false` so a bootstrap
  rollback doesn't disable APIs depended on by live workloads.
- **Terraform state bucket** — `<project_id>-tfstate`, versioned, uniform
  bucket-level access, public access prevention enforced, 90-day archived-
  version retention, `prevent_destroy = true` lifecycle. A stray
  `terraform destroy` of the bootstrap stack cannot wipe the state bucket.
- **Workload Identity Federation pool + provider** — pinned to a single
  GitHub repo via `attribute_condition`. No long-lived JSON keys land on a
  CI runner; tokens are minted per-job and expire in an hour.
- **CI deployer service account** — `medapp-ci-deployer@<project>.iam.gserviceaccount.com`.
  Per-env role list — dev/staging are broad enough for iteration; prod is
  strictly `container.developer` + `artifactregistry.reader`.
- **Artifact Registry docker repo** — `<region>-docker.pkg.dev/<project>/medapp/`.
  Prod sets `immutable_tags = true` so `:latest` cannot silently shift.

---

## Security notes

- WIF `attribute_condition` is pinned to one `org/repo`. Without that, any
  GitHub workflow worldwide can mint a token and impersonate.
- The tfstate bucket has `prevent_destroy = true`. Removing this lifecycle
  rule must be a separate PR — it's the closest thing Terraform has to a
  destructive-action review gate.
- Prod's CI deployer SA does NOT have `secretmanager.secretAccessor` at
  the project level. Specific secrets get granted via Workload Identity
  bindings in slice 3.
- `disable_on_destroy = false` on API resources is deliberate: disabling
  `container.googleapis.com` while a GKE cluster is running would melt
  the cluster.
