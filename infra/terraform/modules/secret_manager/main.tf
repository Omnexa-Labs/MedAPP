locals {
  secrets = ["jwt_secret", "stripe_secret", "mpesa_api_key", "twilio_api_secret", "anthropic_api_key"]
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = toset(local.secrets)
  secret_id = "medapp-${var.env}-${each.value}"
  replication { auto {} }
}
