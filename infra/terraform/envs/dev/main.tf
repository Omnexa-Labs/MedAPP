# Dev environment stack.
#
# Depends on the dev bootstrap stack having been applied first — that
# stack created the `medapp-dev-tfstate` bucket this backend uses, the
# Workload Identity Federation pool that CI authenticates through, and
# enabled the GCP APIs every module here needs.

terraform {
  required_version = ">= 1.8.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.40"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.40"
    }
  }
  backend "gcs" {
    bucket = "medapp-dev-tfstate"
    prefix = "envs/dev"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# google-beta needed for the KMS module's google_project_service_identity.
provider "google-beta" {
  project = var.project_id
  region  = var.region
}

module "network" {
  source     = "../../modules/network"
  project_id = var.project_id
  env        = "dev"
  region     = var.region
}

module "kms" {
  source     = "../../modules/kms"
  project_id = var.project_id
  env        = "dev"
  region     = var.region
}

module "cloud_armor" {
  source     = "../../modules/cloud_armor"
  project_id = var.project_id
  env        = "dev"
}

module "monitoring" {
  source              = "../../modules/monitoring"
  project_id          = var.project_id
  env                 = "dev"
  alert_email         = var.alert_email
  sql_max_connections = 200
}

module "gke" {
  source                  = "../../modules/gke"
  project_id              = var.project_id
  env                     = "dev"
  region                  = var.region
  network                 = module.network.network_self_link
  subnetwork              = module.network.subnet_self_link
  pods_range_name         = module.network.pods_range_name
  services_range_name     = module.network.services_range_name
  master_authorized_cidrs = var.master_authorized_cidrs
}

module "cloud_sql" {
  source                          = "../../modules/cloud_sql"
  project_id                      = var.project_id
  env                             = "dev"
  region                          = var.region
  tier                            = "db-custom-2-7680"
  disk_size_gb                    = 20
  private_network                 = module.network.network_self_link
  private_services_connection_dep = module.network.private_services_connection
  encryption_key_name             = module.kms.sql_key_id
  databases = [
    "medapp_users",
    "medapp_doctors",
    "medapp_nurses",
    "medapp_hospitals",
    "medapp_bookings",
    "medapp_payments",
    "medapp_telemedicines",
    "medapp_notifications",
    "medapp_labs",
    "medapp_ehrs",
    "medapp_socials",
    "medapp_analytics",
    "medapp_hms_mgmt",
    "medapp_pms",
    "medapp_onboarding",
    "medapp_wearable",
    "medapp_inbox",
  ]
}

module "gcs" {
  source       = "../../modules/gcs"
  project_id   = var.project_id
  env          = "dev"
  kms_key_name = module.kms.gcs_key_id
}

module "binary_authorization" {
  source     = "../../modules/binary_authorization"
  project_id = var.project_id
  env        = "dev"
  # Dev is permissive — engineers iterate on un-signed local builds
  # and Cosign keyless requires a GitHub Actions run for every change,
  # which would block local development.
  evaluation_mode = "ALWAYS_ALLOW"
}

# Per-service Workload Identity GSAs. The Helm chart's per-service
# `gsa` field is computed at render time from projectId + service name
# (see infra/helm/medapp/templates/serviceaccount.yaml).
module "service_identity" {
  source     = "../../modules/service_identity"
  project_id = var.project_id
  env        = "dev"
  namespace  = "medapp-dev"
  services = [
    "api_gateway",
    "user_service",
    "doctor_service",
    "nurse_service",
    "hospital_service",
    "booking_service",
    "payment_service",
    "telemedicine_service",
    "notification_service",
    "lab_service",
    "ehr_service",
    "social_service",
    "analytics_service",
    "hms_service",
    "pms_service",
    "onboarding_service",
    "wearable_sync_service",
    "inbox_service",
  ]
}

# Per-service Google Secret Manager secrets. Each service's GSA gets
# secretAccessor on its own secret only — a compromised user_service
# pod cannot read payment_service's Stripe key.
module "secrets" {
  source             = "../../modules/secret_manager"
  project_id         = var.project_id
  env                = "dev"
  namespace          = "medapp-dev"
  service_gsa_emails = module.service_identity.service_account_emails
}

# ── Convenience outputs ─────────────────────────────────────────────────────
output "cluster_name" {
  value = module.gke.cluster_name
}

output "cluster_location" {
  value = module.gke.location
}

output "sql_instance_connection" {
  value = module.cloud_sql.instance_connection_name
}

output "uploads_bucket" {
  value = module.gcs.uploads_bucket
}

# Map of service key → GSA email. The Helm chart computes the same
# values from projectId, so this output is informational — useful when
# granting per-service IAM on external resources outside this stack.
output "service_account_emails" {
  value = module.service_identity.service_account_emails
}

# Feed into the platform chart install: `--set externalSecretsAuth.gsaEmail=<value>`.
output "eso_reader_gsa_email" {
  value = module.secrets.eso_reader_gsa_email
}

# Pass into the medapp Helm chart as `--set ingress.cloudArmorPolicy=<value>`
# when slice 6's Cloud Armor lands at the GCLB ingress.
output "cloud_armor_policy" {
  value = module.cloud_armor.policy_name
}

output "kms_keyring" {
  value = module.kms.keyring_id
}
