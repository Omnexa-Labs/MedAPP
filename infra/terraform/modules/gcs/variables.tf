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

variable "location" {
  type        = string
  default     = "EU"
  description = "GCS multi-region. EU keeps data in the EU for GDPR alignment."
}

variable "kms_key_name" {
  type        = string
  description = "KMS crypto key id for CMEK on every bucket. Empty falls back to Google-managed encryption."
  default     = ""
}
