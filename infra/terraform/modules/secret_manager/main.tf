# Per-service Secret Manager secrets with per-GSA IAM grants.
#
# Each service gets one `medapp-<env>-<service>` Google Secret. The
# secret payload is operator-managed (set via gcloud or the GCP
# console) — Terraform owns the schema, not the values.
#
# Per-service IAM tightens the slice-4 baseline: instead of granting
# `roles/secretmanager.secretAccessor` at the project level (every
# GSA reads every secret), we grant per-secret access only to the
# corresponding service's GSA. A compromised user_service pod cannot
# read payment_service's Stripe key.
#
# Inputs:
#   service_gsa_emails — map of service key → GSA email, output by the
#     `service_identity` module.

resource "google_secret_manager_secret" "per_service" {
  for_each  = var.service_gsa_emails
  project   = var.project_id
  secret_id = "medapp-${var.env}-${replace(each.key, "_", "-")}"

  replication {
    auto {}
  }

  labels = {
    medapp_env     = var.env
    medapp_service = replace(each.key, "_", "-")
  }
}

# Per-secret IAM: only the corresponding service's GSA can read.
resource "google_secret_manager_secret_iam_member" "per_service_accessor" {
  for_each = var.service_gsa_emails

  project   = var.project_id
  secret_id = google_secret_manager_secret.per_service[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${each.value}"
}

# A small set of shared secrets that genuinely cross services (e.g.
# shared OAuth client credentials, third-party API keys consumed by
# multiple services). Access is granted explicitly via shared_secret_readers
# so the IAM trail names every consumer.
resource "google_secret_manager_secret" "shared" {
  for_each  = toset(var.shared_secrets)
  project   = var.project_id
  secret_id = "medapp-${var.env}-shared-${each.value}"

  replication {
    auto {}
  }

  labels = {
    medapp_env  = var.env
    medapp_kind = "shared"
  }
}

resource "google_secret_manager_secret_iam_member" "shared_readers" {
  for_each = {
    for pair in flatten([
      for secret in var.shared_secrets : [
        for svc in lookup(var.shared_secret_readers, secret, []) : {
          secret = secret
          svc    = svc
        }
      ]
    ]) :
    "${pair.secret}|${pair.svc}" => pair
  }

  project   = var.project_id
  secret_id = google_secret_manager_secret.shared[each.value.secret].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.service_gsa_emails[each.value.svc]}"
}

# ── External Secrets Operator reader GSA ────────────────────────────────────
# The platform chart's ClusterSecretStore impersonates this GSA via the
# `external-secrets-reader` K8s SA in the medapp namespace. The GSA gets
# secretAccessor on EVERY per-service + shared secret in this module
# (granted below). It does NOT get any project-level role — ESO reads
# only the secrets we explicitly bound here.

resource "google_service_account" "eso_reader" {
  project      = var.project_id
  account_id   = "external-secrets-reader-wi"
  display_name = "External Secrets Operator reader (${var.env})"
  description  = "Used by the platform chart's ClusterSecretStore to read medapp secrets. See infra/helm/platform/README.md."
}

resource "google_service_account_iam_member" "eso_reader_wi" {
  service_account_id = google_service_account.eso_reader.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[${var.namespace}/external-secrets-reader]"
}

resource "google_secret_manager_secret_iam_member" "eso_per_service" {
  for_each = var.service_gsa_emails

  project   = var.project_id
  secret_id = google_secret_manager_secret.per_service[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.eso_reader.member
}

resource "google_secret_manager_secret_iam_member" "eso_shared" {
  for_each = toset(var.shared_secrets)

  project   = var.project_id
  secret_id = google_secret_manager_secret.shared[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.eso_reader.member
}
