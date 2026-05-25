output "sql_key_id" {
  value       = google_kms_crypto_key.sql.id
  description = "Pass to cloud_sql module's encryption_key_name."
}

output "gcs_key_id" {
  value       = google_kms_crypto_key.gcs.id
  description = "Pass to gcs module's kms_key_name."
}

output "keyring_id" {
  value = google_kms_key_ring.medapp.id
}

# Service identities the CMEK keys are bound to. Useful for auditing
# "who can use this key" without scrolling through IAM policies.
output "sqladmin_service_identity" {
  value = google_project_service_identity.sqladmin.email
}

output "gcs_service_identity" {
  value = data.google_storage_project_service_account.gcs_agent.email_address
}
