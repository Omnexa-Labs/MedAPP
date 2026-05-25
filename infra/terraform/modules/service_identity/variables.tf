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
  description = "K8s namespace the services run in. Used for the Workload Identity principal."
  default     = "medapp"
}

variable "services" {
  type        = list(string)
  description = "Service keys (e.g. user_service). Underscores are normalised to hyphens for the GSA account_id and K8s ServiceAccount name."
}

variable "baseline_roles" {
  type        = list(string)
  description = "Roles granted to every service GSA. Defaults cover logging, tracing, profiling, Cloud SQL client, and secret-accessor."
  default = [
    "roles/logging.logWriter",
    "roles/cloudtrace.agent",
    "roles/cloudprofiler.agent",
    "roles/cloudsql.client",
    "roles/secretmanager.secretAccessor",
  ]
}

variable "extra_roles" {
  type        = map(list(string))
  description = "Per-service extra role grants. Key is service name (raw, with underscores), value is list of role strings."
  default     = {}
}
