variable "project_id" {
  type    = string
  default = "medapp-dev"
}

variable "region" {
  type    = string
  default = "europe-west1"
}

variable "master_authorized_cidrs" {
  type = list(object({
    name = string
    cidr = string
  }))
  default     = []
  description = "Operator workstations / CI tunnels allowed to reach the GKE control plane API. Empty means GKE is only reachable from inside the VPC (or via IAP-tunneled jumpbox)."
}

variable "alert_email" {
  type        = string
  description = "Email that receives Cloud Monitoring alerts. Set to a real address before going live."
  default     = ""
}
