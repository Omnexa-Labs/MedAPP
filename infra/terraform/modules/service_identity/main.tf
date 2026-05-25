# Per-service Google Service Accounts + Workload Identity bindings.
#
# For every service named in `var.services`, this module creates:
#
#   1. A Google Service Account `<service>-wi@<project>.iam.gserviceaccount.com`.
#   2. A Workload Identity binding mapping the K8s ServiceAccount
#      `<namespace>/<kname(service)>` to that GSA — the Helm chart's
#      ServiceAccount carries the `iam.gke.io/gcp-service-account`
#      annotation pointing here.
#   3. A baseline IAM role grant: logging.logWriter + cloudtrace.agent +
#      cloudprofiler.agent + cloudsql.client + secretAccessor.
#
# The baseline is what every service needs (write logs/traces, talk to
# Cloud SQL via the Auth Proxy, read its own secrets). Per-service
# extras (e.g. payment_service needing Pub/Sub publisher) get added by
# the env stack via the `extra_roles` map.
#
# Underscores in service names → hyphens in GSA email (GSA account_id
# is DNS-1123). Matches the Helm chart's medapp.kname helper.

locals {
  # Map service_key (e.g. "user_service") → DNS-1123 SA name ("user-service-wi").
  sa_names = {
    for s in var.services :
    s => "${replace(s, "_", "-")}-wi"
  }
  ksa_names = {
    for s in var.services :
    s => replace(s, "_", "-")
  }
}

resource "google_service_account" "service" {
  for_each = toset(var.services)
  project  = var.project_id

  account_id   = local.sa_names[each.key]
  display_name = "MedApp ${each.key} (${var.env})"
  description  = "Workload Identity GSA for ${each.key} in ${var.env}. Bound to K8s SA ${var.namespace}/${local.ksa_names[each.key]}."
}

# Workload Identity binding — K8s SA → GSA. The K8s SA is what the pod
# runs as (set by the Helm chart's `serviceAccountName`); the
# iam.gke.io/gcp-service-account annotation on that K8s SA names the
# GSA. This binding completes the link so Google's metadata server
# trusts the K8s SA's token.
resource "google_service_account_iam_member" "workload_identity" {
  for_each = toset(var.services)

  service_account_id = google_service_account.service[each.key].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[${var.namespace}/${local.ksa_names[each.key]}]"
}

# ── Baseline project-level role grants ──────────────────────────────────────
# Every service writes logs, emits traces, profiles, talks to Cloud SQL,
# and reads its own secrets. Granted at the project level because the
# logging/trace/profiler agents do not support resource-scoped grants.
resource "google_project_iam_member" "baseline" {
  for_each = {
    for pair in setproduct(var.services, var.baseline_roles) :
    "${pair[0]}|${pair[1]}" => pair
  }
  project = var.project_id
  role    = each.value[1]
  member  = google_service_account.service[each.value[0]].member
}

# ── Per-service extra roles ────────────────────────────────────────────────
# `extra_roles` is keyed by service name with a list of roles. E.g.:
#   extra_roles = {
#     payment_service = ["roles/pubsub.publisher"]
#   }
resource "google_project_iam_member" "extra" {
  for_each = {
    for pair in flatten([
      for svc, roles in var.extra_roles : [
        for r in roles : { svc = svc, role = r }
      ]
    ]) :
    "${pair.svc}|${pair.role}" => pair
  }
  project = var.project_id
  role    = each.value.role
  member  = google_service_account.service[each.value.svc].member
}
