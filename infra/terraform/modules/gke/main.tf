# GKE Autopilot regional cluster.
#
# Autopilot manages nodes for us — there are no `google_container_node_pool`
# resources. Pod resource requests determine billing; node sizing /
# autoscaling / OS patching / security baseline are Google's problem.
#
# Security posture decisions worth knowing about:
#
#   1. `enable_autopilot = true` automatically gives us shielded nodes,
#      secure boot, integrity monitoring, restricted privileges (no root
#      containers, no privileged hostPath), Pod Security Standards
#      "restricted" enforced at admission, and Workload Identity.
#   2. Private cluster: nodes have no public IP (egress via Cloud NAT
#      from the network module). For dev/staging the control plane is
#      reachable publicly (gated by master authorized networks) so
#      kubectl from a workstation works. For prod, the control plane
#      is private-only — kubectl traffic must come from inside the VPC
#      or through IAP.
#   3. Binary Authorization in PROJECT_SINGLETON_POLICY_ENFORCE mode is
#      DEFERRED — slice 4 wires Cosign signing and only then can we
#      gate admission on signed images. The policy resource sits
#      separately so we can flip it from ALWAYS_ALLOW to a real
#      attestation requirement without restating the cluster.
#   4. Release channel REGULAR — auto-upgrades on Google's schedule
#      keep us on a supported version without operator toil.

resource "google_container_cluster" "primary" {
  project  = var.project_id
  name     = "medapp-${var.env}"
  location = var.region

  network    = var.network
  subnetwork = var.subnetwork

  # ── Autopilot ─────────────────────────────────────────────────────────
  enable_autopilot = true

  # ── IP allocation ─────────────────────────────────────────────────────
  ip_allocation_policy {
    cluster_secondary_range_name  = var.pods_range_name
    services_secondary_range_name = var.services_range_name
  }

  # ── Private cluster ───────────────────────────────────────────────────
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = var.env == "prod"
    master_ipv4_cidr_block  = var.master_cidr

    master_global_access_config {
      enabled = true
    }
  }

  # Master authorized networks — who can reach the control plane API.
  # IAP source range stays on for `gcloud container clusters get-credentials`
  # via the GKE auth plugin. Extra ranges (your office IP, ngrok tunnel,
  # whatever) come from the env var.
  master_authorized_networks_config {
    gcp_public_cidrs_access_enabled = false
    dynamic "cidr_blocks" {
      for_each = var.master_authorized_cidrs
      content {
        cidr_block   = cidr_blocks.value.cidr
        display_name = cidr_blocks.value.name
      }
    }
  }

  # ── Workload Identity ─────────────────────────────────────────────────
  # Pods authenticate to GCP APIs as their bound K8s ServiceAccount via
  # the workload pool. No JSON keys, no Secret Manager round-trip for
  # service-to-service auth.
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  # ── Release channel ───────────────────────────────────────────────────
  release_channel {
    channel = "REGULAR"
  }

  # ── Logging + monitoring ──────────────────────────────────────────────
  # Default for Autopilot is SYSTEM + WORKLOADS; we set explicitly so a
  # future Google default change doesn't silently drop our log stream.
  logging_config {
    enable_components = [
      "SYSTEM_COMPONENTS",
      "WORKLOADS",
      "APISERVER",
      "CONTROLLER_MANAGER",
      "SCHEDULER",
    ]
  }

  monitoring_config {
    enable_components = [
      "SYSTEM_COMPONENTS",
      "STORAGE",
      "HPA",
      "POD",
      "DAEMONSET",
      "DEPLOYMENT",
      "STATEFULSET",
      "APISERVER",
    ]
    managed_prometheus {
      enabled = true
    }
  }

  # ── Misc ──────────────────────────────────────────────────────────────
  deletion_protection = var.env == "prod"

  # Network policy enforcement is on by default with Autopilot
  # (Dataplane V2 / Cilium). We do NOT need to add a `network_policy`
  # block here — that block is for Standard clusters. We also DON'T set
  # `initial_node_count` or `remove_default_node_pool` here: those
  # belong to Standard clusters and the provider conflicts them with
  # `enable_autopilot = true`.
}
