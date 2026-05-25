variable "project_id" {
  type    = string
  default = "medapp-prod"
}

variable "region" {
  type    = string
  default = "europe-west1"
}

variable "sql_tier" {
  type        = string
  default     = "db-custom-4-15360"
  description = "Cloud SQL machine tier for prod. Bumped from dev's 2vCPU/7.5GB to 4vCPU/15GB."
}

variable "alert_email" {
  type        = string
  description = "Email that receives Cloud Monitoring alerts. Set to a real on-call address before going live."
  default     = ""
}

variable "admin_cidrs" {
  type        = list(string)
  description = "Operator IP CIDRs that bypass Cloud Armor's WAF + rate limit on prod. Keep this list short — every entry weakens the gate."
  default     = []
}
