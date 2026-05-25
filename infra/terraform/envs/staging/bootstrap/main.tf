# Bootstrap stack for the staging project. See envs/dev/bootstrap for notes.

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
  env               = "staging"
  region            = var.region
  github_repository = var.github_repository
}

output "tfstate_bucket" { value = module.bootstrap.tfstate_bucket }
output "workload_identity_provider" { value = module.bootstrap.workload_identity_provider }
output "ci_deployer_sa_email" { value = module.bootstrap.ci_deployer_sa_email }
output "artifact_registry_repo" { value = module.bootstrap.artifact_registry_repo }
