# Staging environment stack.
#
# Mirrors prod's posture (HA Cloud SQL, real ingress) but with smaller
# tiers so the bill is bearable. Used for release-candidate verification
# before promoting to prod.

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
    bucket = "medapp-staging-tfstate"
    prefix = "envs/staging"
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
  env        = "staging"
  region     = var.region
}

module "kms" {
  source     = "../../modules/kms"
  project_id = var.project_id
  env        = "staging"
  region     = var.region
}

module "cloud_armor" {
  source     = "../../modules/cloud_armor"
  project_id = var.project_id
  env        = "staging"
}

module "monitoring" {
  source              = "../../modules/monitoring"
  project_id          = var.project_id
  env                 = "staging"
  alert_email         = var.alert_email
  sql_max_connections = 200
}

module "gke" {
  source                  = "../../modules/gke"
  project_id              = var.project_id
  env                     = "staging"
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
  env                             = "staging"
  region                          = var.region
  tier                            = "db-custom-2-7680"
  disk_size_gb                    = 30
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
  env          = "staging"
  kms_key_name = module.kms.gcs_key_id
}

module "binary_authorization" {
  source          = "../../modules/binary_authorization"
  project_id      = var.project_id
  env             = "staging"
  evaluation_mode = "ALWAYS_ALLOW"
  # Staging stays permissive so PRs can deploy hot fixes without
  # waiting on the signing pipeline. Prod is the gate.
}

module "service_identity" {
  source     = "../../modules/service_identity"
  project_id = var.project_id
  env        = "staging"
  namespace  = "medapp-staging"
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
  env                = "staging"
  namespace          = "medapp-staging"
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
