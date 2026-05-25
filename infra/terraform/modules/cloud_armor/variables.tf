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

variable "admin_cidrs" {
  type        = list(string)
  description = "Operator IP CIDRs that bypass the WAF + rate limit. Empty disables the allow-list rule."
  default     = []
}
