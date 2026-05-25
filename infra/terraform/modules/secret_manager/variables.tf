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

variable "namespace" {
  type        = string
  description = "K8s namespace the medapp services run in. Used for the ESO reader's Workload Identity binding."
}

variable "service_gsa_emails" {
  type        = map(string)
  description = <<-EOT
    Map of service key (e.g. "user_service") → GSA email. Pass
    `module.service_identity.service_account_emails` from the env stack.
    One per-service secret is created for each entry.
  EOT
}

variable "shared_secrets" {
  type        = list(string)
  description = "Names of secrets that genuinely span multiple services (rare). Created as `medapp-<env>-shared-<name>`."
  default     = []
}

variable "shared_secret_readers" {
  type        = map(list(string))
  description = "Per shared-secret allow-list of service keys that may read it. Keys MUST be in `shared_secrets`; values MUST be in `service_gsa_emails`."
  default     = {}
}
