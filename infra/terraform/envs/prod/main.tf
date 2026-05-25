# Prod environment stack.
#
# Differences from dev/staging that matter:
#   - Cloud SQL `availability_type = REGIONAL` (the module handles this
#     by env-switch) — multi-zone failover.
#   - GKE control plane is private-only (the module handles this).
#     kubectl from a workstation requires IAP tunneling or a jumpbox.
#   - deletion_protection is on (Cloud SQL, GKE) — `terraform destroy`
#     of this stack will fail until an operator flips the flag in a
#     separate PR.
#   - GCS buckets have `force_destroy = false` so a `terraform destroy`
#     of the module won't auto-delete PHI uploads.

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
    bucket = "medapp-prod-tfstate"
    prefix = "envs/prod"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

module "network" {
  source     = "../../modules/network"
  project_id = var.project_id
  env        = "prod"
  region     = var.region
}

module "kms" {
  source     = "../../modules/kms"
  project_id = var.project_id
  env        = "prod"
  region     = var.region
}

module "cloud_armor" {
  source      = "../../modules/cloud_armor"
  project_id  = var.project_id
  env         = "prod"
  admin_cidrs = var.admin_cidrs
}

module "monitoring" {
  source              = "../../modules/monitoring"
  project_id          = var.project_id
  env                 = "prod"
  alert_email         = var.alert_email
  sql_max_connections = 400 # db-custom-4-15360 default
}

module "gke" {
  source              = "../../modules/gke"
  project_id          = var.project_id
  env                 = "prod"
  region              = var.region
  network             = module.network.network_self_link
  subnetwork          = module.network.subnet_self_link
  pods_range_name     = module.network.pods_range_name
  services_range_name = module.network.services_range_name
  # master_authorized_cidrs intentionally empty — control plane is private.
}

module "cloud_sql" {
  source                          = "../../modules/cloud_sql"
  project_id                      = var.project_id
  env                             = "prod"
  region                          = var.region
  tier                            = var.sql_tier
  disk_size_gb                    = 100
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
  env          = "prod"
  kms_key_name = module.kms.gcs_key_id
}

module "binary_authorization" {
  source     = "../../modules/binary_authorization"
  project_id = var.project_id
  env        = "prod"

  # Prod requires a Cosign Sigstore attestation. The Slice 4
  # build-and-push workflow signs every image with the workflow's
  # OIDC identity; Binary Authorization verifies the attestation
  # against Rekor at pod-admission time.
  evaluation_mode = "REQUIRE_ATTESTATION"

  # Start in DRYRUN so the first prod deploy after this slice doesn't
  # block while Slice 4 produces its first signed image. Operator
  # flips to ENFORCED_BLOCK_AND_AUDIT_LOG after verifying a signed
  # deploy passes (see the runbook in infra/terraform/README.md).
  enforcement_mode = "DRYRUN_AUDIT_LOG_ONLY"
}

module "service_identity" {
  source     = "../../modules/service_identity"
  project_id = var.project_id
  env        = "prod"
  namespace  = "medapp-prod"
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

module "secrets" {
  source             = "../../modules/secret_manager"
  project_id         = var.project_id
  env                = "prod"
  namespace          = "medapp-prod"
  service_gsa_emails = module.service_identity.service_account_emails
}

output "service_account_emails" {
  value = module.service_identity.service_account_emails
}

output "eso_reader_gsa_email" {
  value = module.secrets.eso_reader_gsa_email
}

output "cloud_armor_policy" {
  value = module.cloud_armor.policy_name
}

output "kms_keyring" {
  value = module.kms.keyring_id
}

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
