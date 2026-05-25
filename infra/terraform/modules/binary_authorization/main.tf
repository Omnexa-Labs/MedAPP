# Binary Authorization policy.
#
# Prod refuses any image whose Cosign-signed attestation cannot be
# verified against the Sigstore public-good Rekor log. Dev and staging
# stay permissive so engineers can iterate without round-tripping
# through the signing pipeline.
#
# The Sigstore attestor uses the slice-4 Cosign keyless flow:
#
#   build-and-push.yml → GitHub OIDC → Fulcio (ephemeral cert) → Rekor
#
# At admission time, BA pulls the signature from Rekor, verifies the
# Fulcio cert chain, and checks the subject identity (which GitHub
# Actions workflow + repo signed it). If any of that fails, the image
# doesn't run.

resource "google_binary_authorization_attestor" "sigstore" {
  count   = var.evaluation_mode == "REQUIRE_ATTESTATION" ? 1 : 0
  project = var.project_id
  name    = "sigstore-cosign-${var.env}"

  attestation_authority_note {
    note_reference = google_container_analysis_note.sigstore[0].name
  }
}

# Container Analysis "note" the attestor records its attestations
# under. One per env so prod's audit log is distinct from staging's.
resource "google_container_analysis_note" "sigstore" {
  count   = var.evaluation_mode == "REQUIRE_ATTESTATION" ? 1 : 0
  project = var.project_id
  name    = "sigstore-cosign-note-${var.env}"

  attestation_authority {
    hint {
      human_readable_name = "Cosign keyless attestation (${var.env})"
    }
  }
}

# Policy. One per project (BA is project-singleton). The default rule
# governs admission for any pod in the project; cluster_admission_rules
# scope tighter rules to specific clusters if the policy ever covers
# multiple clusters in one project (we don't today — one cluster per
# project per ADR 0010 — but the structure is ready).
resource "google_binary_authorization_policy" "policy" {
  project = var.project_id

  # Always allow Google-managed system images (GKE addons, kube-system
  # workloads) — BA would block kube-dns otherwise.
  global_policy_evaluation_mode = "ENABLE"

  # System images that BA exempts unconditionally — without this, the
  # cluster's own kube-system pods fail admission.
  admission_whitelist_patterns {
    name_pattern = "gcr.io/google_containers/*"
  }
  admission_whitelist_patterns {
    name_pattern = "gcr.io/google-containers/*"
  }
  admission_whitelist_patterns {
    name_pattern = "k8s.gcr.io/*"
  }
  admission_whitelist_patterns {
    name_pattern = "registry.k8s.io/*"
  }
  admission_whitelist_patterns {
    name_pattern = "gke.gcr.io/*"
  }
  admission_whitelist_patterns {
    name_pattern = "gcr.io/stackdriver-agents/*"
  }

  default_admission_rule {
    evaluation_mode  = var.evaluation_mode
    enforcement_mode = var.enforcement_mode

    # Only populated when evaluation_mode requires attestation.
    require_attestations_by = var.evaluation_mode == "REQUIRE_ATTESTATION" ? [
      google_binary_authorization_attestor.sigstore[0].name,
    ] : []
  }
}
