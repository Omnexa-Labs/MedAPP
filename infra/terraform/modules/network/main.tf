# Private VPC for the env.
#
# Shape:
#
#   - One custom VPC per env (no auto-mode — that would expose default
#     subnets in every region with no firewall guarantees).
#   - One regional subnet with two secondary ranges (pods + services)
#     consumed by the GKE Autopilot cluster.
#   - Cloud NAT for egress. Pods get to the internet without each node
#     needing a public IP — combined with `enable_private_nodes = true`
#     on the cluster, no node IP is reachable from the internet.
#   - VPC peering to Google's Service Networking range so Cloud SQL
#     can attach via private IP (Cloud SQL private IP is not a feature
#     of the SQL instance — it's a peered VPC arrangement set up here).
#   - Firewall: default-deny inbound (GCP default), explicit allow for
#     internal pod-to-pod and IAP-tunneled SSH/kubectl access.

resource "google_compute_network" "vpc" {
  project                 = var.project_id
  name                    = "medapp-${var.env}-vpc"
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
}

resource "google_compute_subnetwork" "primary" {
  project       = var.project_id
  name          = "medapp-${var.env}-subnet"
  ip_cidr_range = var.subnet_cidr
  region        = var.region
  network       = google_compute_network.vpc.id

  # Flow logs on for forensic readiness. 1.0 sampling is overkill for
  # cost; 0.5 keeps the bill tolerable while preserving most incident
  # data. Aggregation interval 5s is the GCP recommended default.
  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }

  # Private Google Access lets pods reach Google APIs (GCR, Secret
  # Manager, Logging) over the internal RFC1918 path even with no
  # public IP — required because the GKE cluster is private.
  private_ip_google_access = true

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = var.pods_cidr
  }
  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = var.services_cidr
  }
}

# ── Cloud NAT (egress for private nodes) ────────────────────────────────────
resource "google_compute_router" "router" {
  project = var.project_id
  name    = "medapp-${var.env}-router"
  region  = var.region
  network = google_compute_network.vpc.id
}

resource "google_compute_router_nat" "nat" {
  project = var.project_id
  name    = "medapp-${var.env}-nat"
  router  = google_compute_router.router.name
  region  = var.region

  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# ── Service Networking peering (for Cloud SQL private IP) ───────────────────
# Reserve a range inside the VPC for Google-managed services (Cloud SQL,
# Memorystore). The peering connection makes that range routable from
# our subnets so pods can reach the SQL instance over RFC1918.
resource "google_compute_global_address" "private_services" {
  project       = var.project_id
  name          = "medapp-${var.env}-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]
}

# ── Firewall rules ──────────────────────────────────────────────────────────
# GCP's implicit firewall denies all inbound by default. We add explicit
# allows for the two paths we actually need.

# Allow IAP tunneling so operators can `gcloud compute ssh --tunnel-through-iap`
# into private nodes without exposing port 22 to the internet. IAP's
# source range (35.235.240.0/20) is GCP-published.
resource "google_compute_firewall" "allow_iap_ssh" {
  project       = var.project_id
  name          = "medapp-${var.env}-allow-iap-ssh"
  network       = google_compute_network.vpc.id
  direction     = "INGRESS"
  source_ranges = ["35.235.240.0/20"]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

# Internal pod-to-pod is allowed via the pods secondary range. The cluster
# also installs its own rules; this is the redundant safety net.
resource "google_compute_firewall" "allow_internal" {
  project       = var.project_id
  name          = "medapp-${var.env}-allow-internal"
  network       = google_compute_network.vpc.id
  direction     = "INGRESS"
  source_ranges = [var.subnet_cidr, var.pods_cidr, var.services_cidr]

  allow {
    protocol = "tcp"
  }
  allow {
    protocol = "udp"
  }
  allow {
    protocol = "icmp"
  }
}
