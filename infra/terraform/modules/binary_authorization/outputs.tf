output "attestor_name" {
  value       = var.evaluation_mode == "REQUIRE_ATTESTATION" ? google_binary_authorization_attestor.sigstore[0].name : null
  description = "Full attestor resource name. Cosign-attest CLI uses this when generating attestations."
}

output "policy_id" {
  value = google_binary_authorization_policy.policy.id
}
