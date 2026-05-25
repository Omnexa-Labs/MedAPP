output "per_service_secret_ids" {
  description = "Map of service key → GSM secret id (the name an ExternalSecret references)."
  value = {
    for svc, sec in google_secret_manager_secret.per_service :
    svc => sec.secret_id
  }
}

output "eso_reader_gsa_email" {
  description = "Email of the ESO reader GSA. Feed into platform helm install as `--set externalSecretsAuth.gsaEmail=<value>`."
  value       = google_service_account.eso_reader.email
}

output "shared_secret_ids" {
  description = "Map of shared secret name → GSM secret id."
  value = {
    for name, sec in google_secret_manager_secret.shared :
    name => sec.secret_id
  }
}
