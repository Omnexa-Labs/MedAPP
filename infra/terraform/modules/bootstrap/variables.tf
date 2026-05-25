variable "project_id" {
  type        = string
  description = "GCP project id (e.g. medapp-dev / medapp-staging / medapp-prod)."
}

variable "env" {
  type        = string
  description = "Environment label: dev | staging | prod."
  validation {
    condition     = contains(["dev", "staging", "prod"], var.env)
    error_message = "env must be one of: dev, staging, prod."
  }
}

variable "region" {
  type        = string
  description = "Default region for regional resources (state bucket, Artifact Registry)."
  default     = "europe-west1"
}

variable "github_repository" {
  type        = string
  description = <<-EOT
    GitHub `org-or-user/repo-name` allowed to mint GCP tokens via WIF.
    Used in the WIF provider's `attribute_condition` and the
    principalSet binding on the deployer SA. No wildcards — this MUST
    name a single repo.
  EOT
  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must look like `org/repo`."
  }
}

variable "required_apis" {
  type        = list(string)
  description = "GCP APIs to enable on the project."
  default = [
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "serviceusage.googleapis.com",
    "container.googleapis.com",
    "compute.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudkms.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "cloudtrace.googleapis.com",
    "containeranalysis.googleapis.com",
    "binaryauthorization.googleapis.com",
    "servicenetworking.googleapis.com",
    "dns.googleapis.com",
    "storage.googleapis.com",
    "pubsub.googleapis.com",
    "redis.googleapis.com",
  ]
}

variable "ci_deployer_roles" {
  type        = list(string)
  description = <<-EOT
    Roles granted to the CI deployer SA on the project. Defaults give a
    workable deploy baseline; per-env overrides should tighten prod.
  EOT
  default = [
    # Deploy workloads to GKE
    "roles/container.developer",
    # Read images out of Artifact Registry (write is granted at the
    # repo level so the role isn't project-wide)
    "roles/artifactregistry.reader",
    # Read secrets at runtime to render Helm values
    "roles/secretmanager.secretAccessor",
    # Read logs for post-deploy smoke verification
    "roles/logging.viewer",
  ]
}
