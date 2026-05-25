# Bootstrap stack for the dev project.
#
# First-time apply uses a LOCAL backend (the state bucket doesn't exist yet
# — chicken-and-egg). After the first apply, follow the README to migrate
# state into the newly-created bucket if you want a remote backend for the
# bootstrap itself; staying local is also fine because bootstrap rarely
# changes and the operator's machine is the only one that applies it.

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.40"
    }
  }
  # Intentionally LOCAL — see comment above.
}

provider "google" {
  project = var.project_id
  region  = var.region
}

module "bootstrap" {
  source            = "../../../modules/bootstrap"
  project_id        = var.project_id
  env               = "dev"
  region            = var.region
  github_repository = var.github_repository

  # Dev is the broadest by design (developers iterate here). Staging
  # inherits the same set; prod tightens it.
}

output "tfstate_bucket" {
  value       = module.bootstrap.tfstate_bucket
  description = "Configure envs/dev/main.tf backend `bucket =` with this value."
}

output "workload_identity_provider" {
  value = module.bootstrap.workload_identity_provider
}

output "ci_deployer_sa_email" {
  value = module.bootstrap.ci_deployer_sa_email
}

output "artifact_registry_repo" {
  value = module.bootstrap.artifact_registry_repo
}
