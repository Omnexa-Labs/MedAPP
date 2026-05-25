# Cloud Monitoring alert policies + notification channel placeholder.
#
# The cluster has Managed Prometheus on (Slice 2). Workload metrics
# already flow into Cloud Monitoring; this module declares the alert
# policies that wake people up.
#
# Alert list (highest-signal, low-noise):
#
#   1. api_gateway 5xx rate > 1% for 5m
#   2. api_gateway P95 latency > 1s for 5m
#   3. Any pod restart loop (>3 restarts in 5m)
#   4. Deployment has unavailable replicas for 5m
#   5. Cloud SQL CPU > 80% for 10m
#   6. Cloud SQL connection count > 80% of max for 5m
#   7. Cloud SQL disk > 80% full
#   8. Binary Authorization admission denials (prod only)
#
# Notification channels: this module declares an EMAIL channel from a
# variable. Real production setups attach a PagerDuty / Opsgenie
# channel by hand; we don't manage those credentials in Terraform.

resource "google_monitoring_notification_channel" "email" {
  count        = var.alert_email != "" ? 1 : 0
  project      = var.project_id
  display_name = "MedApp ${var.env} alerts"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }
}

locals {
  notification_channels = google_monitoring_notification_channel.email[*].id
}

# ── 1. api_gateway 5xx rate ─────────────────────────────────────────────────
resource "google_monitoring_alert_policy" "api_5xx" {
  project      = var.project_id
  display_name = "[${var.env}] api_gateway 5xx rate > 1%"
  combiner     = "OR"

  conditions {
    display_name = "5xx ratio over 5m"
    condition_threshold {
      filter          = "resource.type = \"k8s_container\" AND resource.labels.namespace_name = \"medapp-${var.env}\" AND resource.labels.container_name = \"app\" AND metric.type = \"prometheus.googleapis.com/http_requests_total/counter\" AND metric.labels.status =~ \"5..\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.01
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = local.notification_channels
  alert_strategy {
    auto_close = "1800s"
  }
}

# ── 2. api_gateway P95 latency ──────────────────────────────────────────────
resource "google_monitoring_alert_policy" "api_latency" {
  project      = var.project_id
  display_name = "[${var.env}] api_gateway P95 latency > 1s"
  combiner     = "OR"

  conditions {
    display_name = "P95 over 5m"
    condition_threshold {
      filter          = "resource.type = \"k8s_container\" AND resource.labels.namespace_name = \"medapp-${var.env}\" AND metric.type = \"prometheus.googleapis.com/http_request_duration_seconds/histogram\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 1.0
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_PERCENTILE_95"
      }
    }
  }

  notification_channels = local.notification_channels
  alert_strategy {
    auto_close = "1800s"
  }
}

# ── 3. Pod restart loop ─────────────────────────────────────────────────────
resource "google_monitoring_alert_policy" "pod_restarts" {
  project      = var.project_id
  display_name = "[${var.env}] Pod restart loop"
  combiner     = "OR"

  conditions {
    display_name = ">3 restarts in 5m"
    condition_threshold {
      filter          = "resource.type = \"k8s_container\" AND resource.labels.namespace_name = \"medapp-${var.env}\" AND metric.type = \"kubernetes.io/container/restart_count\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 3
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_DELTA"
      }
    }
  }

  notification_channels = local.notification_channels
  alert_strategy {
    auto_close = "1800s"
  }
}

# ── 4. Deployment unavailable replicas ──────────────────────────────────────
resource "google_monitoring_alert_policy" "deployment_unavailable" {
  project      = var.project_id
  display_name = "[${var.env}] Deployment unavailable replicas > 0 for 5m"
  combiner     = "OR"

  conditions {
    display_name = "unavailable replicas"
    condition_threshold {
      filter          = "resource.type = \"k8s_deployment\" AND resource.labels.namespace_name = \"medapp-${var.env}\" AND metric.type = \"kubernetes.io/deployment/replica_count_unavailable\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  notification_channels = local.notification_channels
  alert_strategy {
    auto_close = "1800s"
  }
}

# ── 5. Cloud SQL CPU ────────────────────────────────────────────────────────
resource "google_monitoring_alert_policy" "sql_cpu" {
  project      = var.project_id
  display_name = "[${var.env}] Cloud SQL CPU > 80% for 10m"
  combiner     = "OR"

  conditions {
    display_name = "CPU utilisation"
    condition_threshold {
      filter          = "resource.type = \"cloudsql_database\" AND metric.type = \"cloudsql.googleapis.com/database/cpu/utilization\""
      duration        = "600s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.8
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  notification_channels = local.notification_channels
  alert_strategy {
    auto_close = "1800s"
  }
}

# ── 6. Cloud SQL connection count ───────────────────────────────────────────
resource "google_monitoring_alert_policy" "sql_connections" {
  project      = var.project_id
  display_name = "[${var.env}] Cloud SQL connections > 80% of max"
  combiner     = "OR"

  conditions {
    display_name = "connections"
    condition_threshold {
      filter          = "resource.type = \"cloudsql_database\" AND metric.type = \"cloudsql.googleapis.com/database/postgresql/num_backends\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = var.sql_max_connections * 0.8
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MAX"
      }
    }
  }

  notification_channels = local.notification_channels
  alert_strategy {
    auto_close = "1800s"
  }
}

# ── 7. Cloud SQL disk utilisation ───────────────────────────────────────────
resource "google_monitoring_alert_policy" "sql_disk" {
  project      = var.project_id
  display_name = "[${var.env}] Cloud SQL disk > 80% full"
  combiner     = "OR"

  conditions {
    display_name = "disk utilisation"
    condition_threshold {
      filter          = "resource.type = \"cloudsql_database\" AND metric.type = \"cloudsql.googleapis.com/database/disk/utilization\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.8
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  notification_channels = local.notification_channels
  alert_strategy {
    auto_close = "1800s"
  }
}

# ── 8. Binary Authorization denials (prod gets noticed) ─────────────────────
resource "google_monitoring_alert_policy" "binauthz_denials" {
  count = var.env == "prod" ? 1 : 0

  project      = var.project_id
  display_name = "[${var.env}] Binary Authorization denied an image"
  combiner     = "OR"

  conditions {
    display_name = "BA deny event"
    condition_matched_log {
      filter = "resource.type=\"k8s_cluster\" AND protoPayload.methodName=\"io.k8s.core.v1.pods.create\" AND protoPayload.response.status.reason=\"FailedAttestation\""
    }
  }

  notification_channels = local.notification_channels
  alert_strategy {
    auto_close = "1800s"
    notification_rate_limit {
      period = "300s"
    }
  }
}
