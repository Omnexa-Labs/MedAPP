terraform {
  required_version = ">= 1.8.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.40"
    }
  }
  backend "gcs" {
    bucket = "medapp-tfstate"
    prefix = "envs/dev"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

module "network" {
  source     = "../../modules/network"
  project_id = var.project_id
  region     = var.region
  env        = "dev"
}

module "gke" {
  source       = "../../modules/gke"
  project_id   = var.project_id
  region       = var.region
  env          = "dev"
  network      = module.network.network_self_link
  subnetwork   = module.network.subnet_self_link
  node_pool_cpu_machine_type = "e2-standard-4"
  enable_gpu_pool = false
}

module "cloud_sql" {
  source     = "../../modules/cloud_sql"
  project_id = var.project_id
  region     = var.region
  env        = "dev"
  tier       = "db-custom-2-7680"
  databases  = [
    "medapp_users", "medapp_doctors", "medapp_nurses", "medapp_hospitals",
    "medapp_bookings", "medapp_payments", "medapp_telemedicines",
    "medapp_notifications", "medapp_labs", "medapp_ehrs",
    "medapp_socials", "medapp_analytics",
  ]
}

module "gcs" {
  source     = "../../modules/gcs"
  project_id = var.project_id
  env        = "dev"
}

module "secrets" {
  source     = "../../modules/secret_manager"
  project_id = var.project_id
  env        = "dev"
}
