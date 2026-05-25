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

variable "subnet_cidr" {
  type        = string
  description = "Primary subnet range (nodes, VMs)."
  default     = "10.10.0.0/20"
}

variable "pods_cidr" {
  type        = string
  description = "GKE pod range. /16 gives ~65k pod IPs — sized for HPA across all services."
  default     = "10.20.0.0/16"
}

variable "services_cidr" {
  type        = string
  description = "GKE service (ClusterIP) range."
  default     = "10.30.0.0/20"
}
