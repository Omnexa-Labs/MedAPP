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

variable "region" {
  type    = string
  default = "europe-west1"
}

variable "tier" {
  type        = string
  description = "Cloud SQL machine tier. Per-env defaults below; override in tfvars if needed."
}

variable "databases" {
  type        = list(string)
  description = "One DB per backend service. Names are stable identifiers used in DATABASE_URL."
}

variable "disk_size_gb" {
  type        = number
  default     = 20
  description = "Initial storage; disk_autoresize handles growth."
}

variable "private_network" {
  type        = string
  description = "Self-link of the VPC for the Cloud SQL private IP. Required: there is no public path."
}

variable "encryption_key_name" {
  type        = string
  description = "KMS crypto key id (resource id, not self-link). When set, Cloud SQL data + backups encrypt under this CMEK. Empty means Google-managed encryption."
  default     = ""
}

variable "private_services_connection_dep" {
  type        = any
  description = <<-EOT
    Pass `module.network.private_services_connection` here. Terraform
    needs an explicit dependency on the peering connection or it tries
    to create the SQL instance before the peering exists.
  EOT
  default     = null
}
