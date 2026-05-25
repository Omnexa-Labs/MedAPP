output "service_account_emails" {
  description = "Map of service key → GSA email. Useful for grepping when granting per-service IAM on external resources."
  value = {
    for svc, sa in google_service_account.service :
    svc => sa.email
  }
}
