# Terraform — GCP

Layout follows the standard "modules + envs" pattern. Each env is an isolated
backend state. Never apply prod without a peer-reviewed plan.

```
terraform/
  modules/
    network/              VPC, subnets, firewall, Cloud NAT
    gke/                  Regional GKE cluster + node pools (CPU + GPU)
    cloud_sql/            Postgres HA + read replicas
    gcs/                  Buckets (uploads, mlflow artifacts, terraform state)
    pubsub/               Topics + subscriptions (event bus mirror)
    secret_manager/       Secrets + IAM bindings
    iam/                  Workload Identity bindings per service
  envs/
    dev/
    staging/
    prod/
```

## Bootstrap

1. Create a GCS bucket manually (chicken-and-egg) for tfstate: `gs://medapp-tfstate`.
2. Per-env `backend.tf` configures `gcs` backend with a unique prefix.
3. `terraform init && terraform plan && terraform apply` inside each env folder.
