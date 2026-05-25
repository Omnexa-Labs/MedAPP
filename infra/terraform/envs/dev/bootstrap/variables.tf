variable "project_id" {
  type        = string
  description = "GCP project id for the dev environment."
  default     = "medapp-dev"
}

variable "region" {
  type        = string
  description = "Default region. europe-west1 is the GCP region with lowest latency to Ghana/Nigeria/Kenya."
  default     = "europe-west1"
}

variable "github_repository" {
  type        = string
  description = "GitHub `org/repo` that may mint GCP tokens via WIF."
  # Replace with your real repo path before the first apply.
  default = "REPLACE_WITH_GITHUB_ORG/REPLACE_WITH_REPO_NAME"
}
