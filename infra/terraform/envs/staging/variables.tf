variable "project_id" {
  type    = string
  default = "medapp-staging"
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
  default = []
}

variable "alert_email" {
  type    = string
  default = ""
}
