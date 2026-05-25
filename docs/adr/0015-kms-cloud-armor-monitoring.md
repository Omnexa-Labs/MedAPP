# ADR 0015 — CMEK, Cloud Armor / WAF, Managed Prometheus alerts

- **Status**: Accepted
- **Date**: 2026-05-25

## Context

Slice 6 closes the remaining operational + edge-security gaps:

- Data at rest sat on Google-managed keys. Strong but not customer-
  controlled — disabling a key in response to an incident wasn't an
  option we owned.
- The L7 ingress had no WAF. SQLi / XSS / scanner traffic hit the
  api_gateway directly; we relied entirely on app-layer validation.
- The cluster had Managed Prometheus on (slice 2) but no alert
  policies. The data was flowing; nobody got paged.

## Decision

### CMEK on Cloud SQL + GCS only

The KMS module creates two purpose-scoped keys (`medapp-<env>-sql`,
`medapp-<env>-gcs`) on a single per-env keyring, both with 90-day
automatic rotation and `lifecycle.prevent_destroy = true`.

Cloud SQL data + backups + binlog encrypt under the SQL key; every
GCS bucket in the env (uploads + mlflow) encrypts under the GCS key.

**Why these two, not all four:**
- **Artifact Registry** stays on Google-managed. AR images are
  immutable + Cosign-signed; the threat model CMEK addresses (key
  disablement) doesn't apply to images we want to be able to deploy.
- **Secret Manager** stays on Google-managed. GSM secrets are
  per-service (slice 5) and the per-secret IAM is the harder
  defense; CMEK on top is operational complexity that doesn't pay
  off until a real key-rotation runbook exists.

**Why 90-day rotation:**
- Quarterly cycle aligns with most regulatory audit cadences.
- Shorter periods (e.g. 30d) generate more key versions than the
  team can meaningfully track without tooling we don't have.

**Why `prevent_destroy` not `disabled = true` for retired keys:**
- A `terraform destroy` of the keyring would shred encrypted data
  unrecoverably. `prevent_destroy` is Terraform's strongest brake
  against operator error.
- Real key retirement is a separate three-step process:
  disable → wait 30 days → schedule destruction. Not a terraform-
  driven flow.

### Cloud Armor + Helm Ingress, gated behind a flag

The `cloud_armor` Terraform module creates a project-singleton
security policy with five preconfigured-WAF rules (SQLi, XSS, LFI,
RFI, scanner-detection — all at OWASP CRS sensitivity 4), a per-IP
rate limit (100 req/min, throttle-to-429 above), an optional
operator-IP allow-list, and a terminal default-allow rule.

The Helm chart gains an `ingress.enabled` flag. When on, it renders:
- A GKE `Ingress` for api_gateway with a Google-managed static IP +
  ManagedCertificate (Let's Encrypt cert auto-provisioned for the
  named host).
- A `BackendConfig` CRD that attaches the Cloud Armor policy + health
  check config.
- A `FrontendConfig` that 301-redirects HTTP to HTTPS at the GCLB.
- Annotations on the api_gateway Service: `cloud.google.com/backend-config`
  + `cloud.google.com/neg` so GKE wires the LB through container-native
  load balancing (skips the kube-proxy hop).

**Why a feature flag**: the chart has to install on a fresh cluster
before the operator has created the global static IP + Cloud Armor
policy in Terraform. Default false; operator flips on once those
exist.

**Why preconfigured WAF rather than custom rules**: OWASP CRS is
maintained by people who think about web attacks full-time; a
custom rule list would be both noisier (more false positives) and
weaker (we'd miss attack patterns the CRS authors know about). The
trade-off is occasional CRS false positives on legitimate traffic —
mitigated by the operator IP allow-list and the ability to
preview-mode any rule before turning it on.

**Why Adaptive Protection on staging + prod but not dev**: it's a
billed feature. Dev gets the static WAF rules but skips the ML-based
DDoS detection.

### Managed Prometheus alert policies, eight of them

- 5xx rate on api_gateway > 1% for 5m
- P95 latency on api_gateway > 1s for 5m
- Pod restart > 3 in 5m
- Deployment unavailable replicas > 0 for 5m
- Cloud SQL CPU > 80% for 10m
- Cloud SQL connections > 80% of max for 5m
- Cloud SQL disk > 80% full for 5m
- (prod only) Binary Authorization admission denials

Notification channel: email, from a per-env variable. Real
production setups wire PagerDuty / Opsgenie by hand — those
credentials don't belong in Terraform.

**Why this set and not 50 alerts**: every alert that pages humans
trains them to ignore the next one if it's wrong. The list above is
the floor — alerts you genuinely want a 3am page for. Coverage of
business-logic SLOs (booking success rate, payment success rate, etc.)
comes when there are real users to measure them against.

**Why no Grafana dashboards in this slice**: GCP's built-in
Monitoring UI plus the Slice 2 Managed Prometheus exporter cover
the dashboard need. Operating a Grafana install adds an attack
surface for what's a UI choice.

### Explicitly deferred

- **VPC Service Controls**: org-level (requires Access Context
  Manager), needs a per-API ingress/egress policy, and produces
  spectacular failures if misconfigured. Worth doing when we have a
  real audit demanding it; not now.
- **Multi-region disaster recovery**: not on the roadmap until PMF.
- **CMEK on Artifact Registry + Secret Manager**: see above.

## Consequences

**Good:**
- Disabling the SQL key in Cloud Console makes prod Postgres
  unreadable in <5 minutes. The incident-response lever exists.
- GCLB drops SQLi / XSS / scanner traffic at the edge. The
  app-layer validators are the second line, not the first.
- 100 req/min/IP is the network-level rate floor; the booking
  service's per-user limit (slice 8) layers on top.
- The eight alert policies catch the failures that actually wake
  people up. They land in Cloud Monitoring with notification rate-
  limiting so a thundering-herd cascade doesn't flood the inbox.

**Bad:**
- CMEK adds latency on Cloud SQL writes — measured at ~1-2ms per
  transaction in Google's benchmarks. Negligible for a healthcare
  workload, observable for a high-frequency one we don't run.
- ManagedCertificate provisioning takes ~15-60 minutes after the
  Ingress applies (Let's Encrypt rate-limits new certs). First
  production deploy will look broken for that window.
- Cloud Armor's preconfigured WAF rules occasionally flag legit
  inputs (esp. medical free-text with words that match SQLi
  signatures). Operator IP allow-list is the escape valve; a real
  fix is per-route exemption rules we add only when we hit them.
- Per-IP rate limit of 100 req/min is conservative — a clinician
  scrolling a long patient list could touch that ceiling on slow
  pagination. Adjust upward in `cloud_armor.tf` if production shows
  legitimate hits.

**Out of scope:**
- VPC Service Controls (see above).
- CMEK on AR / Secret Manager (see above).
- Grafana dashboards (see above).
- Per-route Cloud Armor exemptions (add when hit).
