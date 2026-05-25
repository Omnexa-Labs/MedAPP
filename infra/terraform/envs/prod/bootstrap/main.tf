# Bootstrap stack for the prod project.
#
# Prod intentionally has a narrower role list than dev/staging — the CI
# deployer can deploy workloads to GKE and read images, but cannot read
# secrets project-wide or view all logs. Any role widening here should
# be a security review checkpoint.

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.40"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

module "bootstrap" {
  source            = "../../../modules/bootstrap"
  project_id        = var.project_id
  env               = "prod"
  region            = var.region
  github_repository = var.github_repository

  # Tighter than the module default: no secretmanager.secretAccessor at
  # the project level (specific secrets get granted in slice 3 via
  # Workload Identity bindings), no logging.viewer (operators use
  # gcloud directly).
  ci_deployer_roles = [
    "roles/container.developer",
    "roles/artifactregistry.reader",
  ]
}

output "tfstate_bucket" { value = module.bootstrap.tfstate_bucket }
output "workload_identity_provider" { value = module.bootstrap.workload_identity_provider }
output "ci_deployer_sa_email" { value = module.bootstrap.ci_deployer_sa_email }
output "artifact_registry_repo" { value = module.bootstrap.artifact_registry_repo }
