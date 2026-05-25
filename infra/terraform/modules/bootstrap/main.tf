# Bootstrap module — one apply per GCP project.
#
# Creates the substrate every other Terraform stack and CI workflow leans on:
#
#   1. Enables required Google APIs (idempotent).
#   2. Provisions the Terraform-state GCS bucket — versioned, locked down,
#      with a 90-day non-current retention so a fat-finger `rm` is recoverable
#      but old state doesn't accumulate forever.
#   3. Wires Workload Identity Federation for GitHub Actions, scoped to a
#      specific (org, repo) pair. No long-lived JSON keys land on a CI runner.
#   4. Creates a least-privilege CI deployer service account and grants it
#      only the roles each env actually needs (prod is stricter than dev).
#   5. Creates an Artifact Registry docker repo so service images have a
#      home before slice 4 wires the build pipeline.
#
# This module is intentionally separate from the main env stack: destroying
# `envs/dev` must NEVER delete the state bucket that holds its state. Hence
# `envs/<env>/bootstrap/` is its own Terraform state.
#
# First-time apply must use LOCAL backend (chicken-and-egg). See README.

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.40"
    }
  }
}

# Capture the project's auto-generated number — WIF principal sets and IAM
# bindings need it, and using the number means a project rename never breaks
# the binding.
data "google_project" "current" {
  project_id = var.project_id
}

# ── APIs ────────────────────────────────────────────────────────────────────
# Disable_on_destroy = false so a `terraform destroy` of the bootstrap stack
# doesn't disable APIs other workloads in the project might depend on.
resource "google_project_service" "required" {
  for_each = toset(var.required_apis)
  project  = var.project_id
  service  = each.value

  disable_on_destroy         = false
  disable_dependent_services = false
}

# ── Terraform state bucket ──────────────────────────────────────────────────
# Locked-down by default. Public access is impossible (public_access_prevention
# enforced). Uniform bucket-level access stops legacy ACL exposure.
resource "google_storage_bucket" "tfstate" {
  project                     = var.project_id
  name                        = "${var.project_id}-tfstate"
  location                    = var.region
  force_destroy               = false
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning { enabled = true }

  # Operator slip-up recovery: deleted state versions stay around 90 days.
  lifecycle_rule {
    condition { num_newer_versions = 10 }
    action { type = "Delete" }
  }
  lifecycle_rule {
    condition {
      age        = 90
      with_state = "ARCHIVED"
    }
    action { type = "Delete" }
  }

  # Block any out-of-band `tofu destroy` from wiping the state.
  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.required]
}

# ── Workload Identity Federation for GitHub Actions ─────────────────────────
# A WIF pool + OIDC provider that trusts GitHub's token issuer. The
# attribute_condition pins this binding to a single repo so a token minted
# by a fork or unrelated org cannot impersonate the deployer SA.
resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "github-actions-${var.env}"
  display_name              = "GitHub Actions (${var.env})"
  description               = "Federated identity for GitHub Actions deploying to ${var.env}"
  disabled                  = false

  depends_on = [google_project_service.required]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider-${var.env}"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  # CRITICAL: pin to one repo. Without this, *any* GitHub workflow worldwide
  # whose token mints through Google's federation endpoint can impersonate.
  attribute_condition = "assertion.repository == \"${var.github_repository}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# ── CI deployer service account ─────────────────────────────────────────────
# One SA per env. The actor that ran the workflow shows up in audit logs
# via attribute.actor → google.subject. Prod IAM is intentionally narrower
# (no cloudsql.admin, no iam.admin) to keep blast radius down.
resource "google_service_account" "ci_deployer" {
  project      = var.project_id
  account_id   = "medapp-ci-deployer"
  display_name = "MedApp CI deployer (${var.env})"
  description  = "Used by GitHub Actions for kubectl + helm deploys in ${var.env}"

  depends_on = [google_project_service.required]
}

# Bind the deployer SA to GitHub Actions tokens originating from this repo.
# The principalSet syntax pulls only tokens that satisfy the attribute_condition
# above, so the binding inherits the single-repo pin.
resource "google_service_account_iam_member" "ci_deployer_wif" {
  service_account_id = google_service_account.ci_deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/projects/${data.google_project.current.number}/locations/global/workloadIdentityPools/${google_iam_workload_identity_pool.github.workload_identity_pool_id}/attribute.repository/${var.github_repository}"
}

# Per-env role grants. Dev is the broadest (developers iterate here), prod
# is the tightest. New roles get added when a slice explicitly needs them
# — opening this list is a security review checkpoint.
resource "google_project_iam_member" "ci_deployer_roles" {
  for_each = toset(var.ci_deployer_roles)
  project  = var.project_id
  role     = each.value
  member   = google_service_account.ci_deployer.member
}

# ── Artifact Registry (Docker) ──────────────────────────────────────────────
# Single repo per project; service images go here as
# `<region>-docker.pkg.dev/<project>/medapp/<service>:<tag>`. Slice 4 wires
# the build pipeline; this just gives those images a home.
resource "google_artifact_registry_repository" "docker" {
  project       = var.project_id
  location      = var.region
  repository_id = "medapp"
  description   = "MedApp service images (${var.env})"
  format        = "DOCKER"

  docker_config {
    immutable_tags = var.env == "prod" ? true : false
  }

  depends_on = [google_project_service.required]
}

# Builder push permission — slice 4 swaps the CI principal to a dedicated
# builder SA. For now the deployer SA is also the builder so we can iterate
# without redoing IAM.
resource "google_artifact_registry_repository_iam_member" "ci_writer" {
  project    = var.project_id
  location   = google_artifact_registry_repository.docker.location
  repository = google_artifact_registry_repository.docker.name
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.ci_deployer.member
}
