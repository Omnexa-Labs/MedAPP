variable "project_id" {
  type = string
}

variable "env" {
  type = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.env)
    error_message = "env must be one of: dev, staging, prod."
  }
}

variable "evaluation_mode" {
  type        = string
  description = <<-EOT
    ALWAYS_ALLOW   — admit any image (default for dev/staging).
    REQUIRE_ATTESTATION — require a Cosign Sigstore attestation (prod).
    ALWAYS_DENY    — refuse every image (lockdown).
  EOT
  default     = "ALWAYS_ALLOW"
  validation {
    condition     = contains(["ALWAYS_ALLOW", "REQUIRE_ATTESTATION", "ALWAYS_DENY"], var.evaluation_mode)
    error_message = "evaluation_mode must be one of: ALWAYS_ALLOW, REQUIRE_ATTESTATION, ALWAYS_DENY."
  }
}

variable "enforcement_mode" {
  type        = string
  description = <<-EOT
    ENFORCED_BLOCK_AND_AUDIT_LOG — reject the pod AND audit-log.
    DRYRUN_AUDIT_LOG_ONLY        — audit-log but admit (useful for first prod rollout).
  EOT
  default     = "ENFORCED_BLOCK_AND_AUDIT_LOG"
  validation {
    condition     = contains(["ENFORCED_BLOCK_AND_AUDIT_LOG", "DRYRUN_AUDIT_LOG_ONLY"], var.enforcement_mode)
    error_message = "enforcement_mode must be one of: ENFORCED_BLOCK_AND_AUDIT_LOG, DRYRUN_AUDIT_LOG_ONLY."
  }
}
