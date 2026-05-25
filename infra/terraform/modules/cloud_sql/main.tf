# Cloud SQL Postgres primary, hardened for PHI workloads.
#
# Posture:
#
#   - Private IP ONLY. ipv4_enabled = false means no public IP is ever
#     allocated; the only path in is the VPC peering set up by the
#     network module. Set up_clean_dependency on the peering connection
#     so terraform applies in the right order.
#   - PITR + automated daily backups in every env. PITR retains 7 days
#     of WAL by default — enough to recover from a logical mistake but
#     not so long that storage bills explode.
#   - HA (REGIONAL) in prod; ZONAL in dev/staging. HA doubles the cost
#     so we only pay for it where uptime matters.
#   - deletion_protection in prod. A `terraform destroy` of an env stack
#     cannot wipe the prod database — operator must remove the flag in
#     a separate PR first.
#   - SSL required (`require_ssl = true`). Auth Proxy / IAM auth handles
#     this transparently for clients that use them.
#   - IAM database authentication on. App pods authenticate via Workload
#     Identity → Cloud SQL Auth Proxy → DB; no static passwords for the
#     service user.
#   - Insights enabled — query stats land in Cloud SQL Insights for slow-
#     query forensics without needing pgbadger.
#   - Database flags: pin a tighter `log_min_duration_statement`, log
#     connections + disconnections (audit trail), and require SSL via
#     pg_hba.

resource "google_sql_database_instance" "primary" {
  project          = var.project_id
  name             = "medapp-${var.env}-pg"
  database_version = "POSTGRES_16"
  region           = var.region

  # CMEK encryption when a key id is supplied. Empty falls back to
  # Google-managed encryption. The kms module's `sql_key_id` output
  # plugs in here from the env stack.
  encryption_key_name = var.encryption_key_name != "" ? var.encryption_key_name : null

  settings {
    tier              = var.tier
    availability_type = var.env == "prod" ? "REGIONAL" : "ZONAL"
    disk_type         = "PD_SSD"
    disk_size         = var.disk_size_gb
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "02:00"
      location                       = var.region
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = var.env == "prod" ? 30 : 7
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.private_network
      ssl_mode        = "ENCRYPTED_ONLY"
    }

    # IAM DB auth — pods authenticate as their Workload Identity SA, no
    # passwords in env vars. Slice 3 wires the per-service IAM users.
    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }

    # Audit-friendly logging. Connections + disconnections give you a
    # row per session; slow-query threshold of 500ms catches the worst
    # offenders without flooding the log.
    database_flags {
      name  = "log_connections"
      value = "on"
    }
    database_flags {
      name  = "log_disconnections"
      value = "on"
    }
    database_flags {
      name  = "log_min_duration_statement"
      value = "500"
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = false
      record_client_address   = false
    }

    maintenance_window {
      day          = 7 # Sunday
      hour         = 3
      update_track = var.env == "prod" ? "stable" : "canary"
    }
  }

  deletion_protection = var.env == "prod"

  # Cloud SQL cannot create until the Service Networking peering is up.
  depends_on = [var.private_services_connection_dep]
}

# One database per service. Names come from the env stack — we don't
# bake them in here because the list will keep growing.
resource "google_sql_database" "dbs" {
  for_each = toset(var.databases)
  project  = var.project_id
  name     = each.value
  instance = google_sql_database_instance.primary.name
}
