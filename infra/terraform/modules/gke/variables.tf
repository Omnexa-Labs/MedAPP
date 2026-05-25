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

variable "network" {
  type        = string
  description = "Self-link of the VPC the cluster lives in."
}

variable "subnetwork" {
  type        = string
  description = "Self-link of the regional subnet."
}

variable "pods_range_name" {
  type        = string
  default     = "pods"
  description = "Secondary range name on the subnet for pod IPs."
}

variable "services_range_name" {
  type        = string
  default     = "services"
  description = "Secondary range name on the subnet for service ClusterIPs."
}

variable "master_cidr" {
  type        = string
  description = "RFC1918 /28 for the GKE control plane. Must not overlap subnet_cidr / pods_cidr / services_cidr."
  default     = "172.16.0.0/28"
}

variable "master_authorized_cidrs" {
  type = list(object({
    name = string
    cidr = string
  }))
  default     = []
  description = <<-EOT
    CIDR blocks allowed to reach the (public-endpoint) control plane in
    dev/staging. Ignored in prod where the endpoint is private.
    Example: [{ name = "operator-laptop", cidr = "203.0.113.4/32" }]
  EOT
}
