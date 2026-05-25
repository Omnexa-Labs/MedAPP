# Customer-Managed Encryption Keys.
#
# One keyring per env, two purpose-scoped keys:
#
#   - `medapp-<env>-sql`  — encrypts Cloud SQL data + backups + binlog
#   - `medapp-<env>-gcs`  — encrypts every GCS bucket in this env
#
# CMEK does not improve confidentiality on its own (Google-managed
# encryption already uses AES-256). What it gives us is:
#
#   1. Key residency control — we can disable a key and watchers lose
#      access in <minutes, regardless of running pods or open SQL
#      connections. The blast-radius lever for a compromise event.
#   2. Audit trail — every encrypt/decrypt call is logged with the
#      caller identity. Without CMEK those calls happen on Google-
#      managed keys we have no visibility into.
#   3. Rotation policy — 90-day automatic rotation enforced by the
#      `rotation_period` here, not by us remembering to rotate.
#
# Per ADR 0015: AR and Secret Manager stay on Google-managed keys for
# now — the operational cost of CMEK on every store doesn't pay for
# itself until we have a real key-rotation runbook.

terraform {
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
}

locals {
  # Cloud KMS keys live in a region. We use the same region as the
  # rest of the env stack so all encrypt/decrypt traffic stays in-region.
  region = var.region
}

resource "google_kms_key_ring" "medapp" {
  project  = var.project_id
  name     = "medapp-${var.env}"
  location = local.region
}

# ── Cloud SQL CMEK ──────────────────────────────────────────────────────────
resource "google_kms_crypto_key" "sql" {
  name     = "medapp-${var.env}-sql"
  key_ring = google_kms_key_ring.medapp.id
  purpose  = "ENCRYPT_DECRYPT"

  # 90-day automatic rotation. Newly-encrypted data uses the new
  # version; existing ciphertext stays readable under prior versions.
  rotation_period = "7776000s" # 90 days

  # Block accidental deletion — keyring delete is rare and almost
  # always an operator mistake. Real key retirement is a multi-step
  # process (disable → wait → destroy), which this lifecycle block
  # enforces by refusing terraform-driven destruction.
  lifecycle {
    prevent_destroy = true
  }
}

# Cloud SQL uses a Google-managed service agent to encrypt data. The
# project's service identity must be granted encrypter/decrypter on
# the key.
data "google_project" "current" {
  project_id = var.project_id
}

resource "google_project_service_identity" "sqladmin" {
  provider = google-beta
  project  = var.project_id
  service  = "sqladmin.googleapis.com"
}

resource "google_kms_crypto_key_iam_member" "sql_agent" {
  crypto_key_id = google_kms_crypto_key.sql.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:${google_project_service_identity.sqladmin.email}"
}

# ── GCS CMEK ────────────────────────────────────────────────────────────────
resource "google_kms_crypto_key" "gcs" {
  name            = "medapp-${var.env}-gcs"
  key_ring        = google_kms_key_ring.medapp.id
  purpose         = "ENCRYPT_DECRYPT"
  rotation_period = "7776000s" # 90 days

  lifecycle {
    prevent_destroy = true
  }
}

# The GCS service agent for the project. `google_storage_project_service_account`
# triggers the agent's creation and returns its email.
data "google_storage_project_service_account" "gcs_agent" {
  project = var.project_id
}

resource "google_kms_crypto_key_iam_member" "gcs_agent" {
  crypto_key_id = google_kms_crypto_key.gcs.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:${data.google_storage_project_service_account.gcs_agent.email_address}"
}
