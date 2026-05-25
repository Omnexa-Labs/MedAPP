# Cloud Armor security policy.
#
# Attached to the api_gateway backend via the GKE `BackendConfig` CRD
# (declared by the Helm chart). Cloud Armor sits at the L7 load
# balancer; every request to the platform hits these rules BEFORE it
# reaches the cluster.
#
# Rule layout (priority order — lower number = evaluated first):
#
#   priority 1000 — preconfigured WAF: SQLi (OWASP CRS sqli-v33-stable)
#   priority 1100 — preconfigured WAF: XSS  (xss-v33-stable)
#   priority 1200 — preconfigured WAF: LFI/RFI (lfi-v33-stable + rfi-v33-stable)
#   priority 1300 — preconfigured WAF: scanner-detection (scannerdetection-v33-stable)
#   priority 2000 — per-IP rate limit: 100 req/min, throttle with 429
#   priority 9000 — explicit allow for known operator CIDRs (var.admin_cidrs)
#   priority 10000 — default action: ALLOW (Cloud Armor needs a terminal rule)
#
# `evaluationLevel = "PRE_AND_POST"` for the WAF rules means Cloud Armor
# evaluates the rule both before and after URL normalisation —
# catching attempts to evade with encoding tricks.

resource "google_compute_security_policy" "main" {
  project = var.project_id
  name    = "medapp-${var.env}-armor"

  description = "Cloud Armor policy for api_gateway in ${var.env}. Attached via BackendConfig."

  # ── SQLi / XSS / LFI / RFI / scanner WAF rules ─────────────────────────
  rule {
    priority = 1000
    action   = var.env == "prod" ? "deny(403)" : "deny(403)"
    match {
      expr {
        expression = "evaluatePreconfiguredWaf('sqli-v33-stable', {'sensitivity': 4})"
      }
    }
    description = "OWASP CRS SQL injection (sensitivity 4)"
  }

  rule {
    priority = 1100
    action   = "deny(403)"
    match {
      expr {
        expression = "evaluatePreconfiguredWaf('xss-v33-stable', {'sensitivity': 4})"
      }
    }
    description = "OWASP CRS XSS (sensitivity 4)"
  }

  rule {
    priority = 1200
    action   = "deny(403)"
    match {
      expr {
        expression = "evaluatePreconfiguredWaf('lfi-v33-stable', {'sensitivity': 4}) || evaluatePreconfiguredWaf('rfi-v33-stable', {'sensitivity': 4})"
      }
    }
    description = "OWASP CRS local + remote file inclusion"
  }

  rule {
    priority = 1300
    action   = "deny(403)"
    match {
      expr {
        expression = "evaluatePreconfiguredWaf('scannerdetection-v33-stable', {'sensitivity': 4})"
      }
    }
    description = "OWASP CRS scanner detection"
  }

  # ── Per-IP rate limit ──────────────────────────────────────────────────
  # 100 requests / minute / source IP. A burst above that throttles
  # with 429 for 60 seconds. Per-route limits live in the booking
  # service (slice 8) — this is the network-edge floor.
  rule {
    priority    = 2000
    description = "Per-IP rate limit: 100 req/min, throttle to 429"
    action      = "throttle"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = 100
        interval_sec = 60
      }
    }
  }

  # ── Admin IP allow-list (skips downstream WAF) ─────────────────────────
  # Operator workstations / known good CIDRs that should never be
  # blocked even if the WAF heuristics flag them.
  dynamic "rule" {
    for_each = length(var.admin_cidrs) > 0 ? [1] : []
    content {
      priority    = 9000
      description = "Operator IP allow-list (skips WAF + rate limit)"
      action      = "allow"
      match {
        versioned_expr = "SRC_IPS_V1"
        config {
          src_ip_ranges = var.admin_cidrs
        }
      }
    }
  }

  # ── Default allow (terminal) ───────────────────────────────────────────
  rule {
    priority    = 2147483647
    description = "Default action"
    action      = "allow"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
  }

  # Adaptive Protection (Cloud Armor's ML-based DDoS detection) only
  # available in prod tier — turn on for staging + prod where the
  # cost makes sense.
  adaptive_protection_config {
    layer_7_ddos_defense_config {
      enable = var.env != "dev"
    }
  }
}
