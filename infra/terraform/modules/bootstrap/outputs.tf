output "tfstate_bucket" {
  value       = google_storage_bucket.tfstate.name
  description = "GCS bucket the env's main Terraform stack uses as a backend."
}

output "workload_identity_provider" {
  value       = google_iam_workload_identity_pool_provider.github.name
  description = <<-EOT
    Full WIF provider resource name. Copy into the GitHub Environment as
    `GCP_WIF_PROVIDER`. Format:
    projects/<num>/locations/global/workloadIdentityPools/<pool>/providers/<provider>
  EOT
}

output "ci_deployer_sa_email" {
  value       = google_service_account.ci_deployer.email
  description = "Copy into the GitHub Environment as `GCP_DEPLOYER_SA`."
}

output "artifact_registry_repo" {
  value       = "${google_artifact_registry_repository.docker.location}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker.repository_id}"
  description = "Docker image prefix. Push images as <prefix>/<service>:<tag>."
}

output "project_number" {
  value       = data.google_project.current.number
  description = "Auto-generated project number — useful for IAM bindings outside Terraform."
}
