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

variable "alert_email" {
  type        = string
  description = "Email address that receives alerts. Empty disables the email channel; alerts still exist but route to no destination — only useful while testing."
  default     = ""
}

variable "sql_max_connections" {
  type        = number
  description = "Max Postgres connections the SQL instance accepts. Used to compute the 80% threshold for the connections alert. db-custom-2-7680 = 200; db-custom-4-15360 = 400."
  default     = 200
}
