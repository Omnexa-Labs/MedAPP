resource "google_sql_database_instance" "primary" {
  name             = "medapp-${var.env}-pg"
  database_version = "POSTGRES_16"
  region           = var.region

  settings {
    tier              = var.tier
    availability_type = var.env == "prod" ? "REGIONAL" : "ZONAL"
    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = var.env == "prod"
    }
    ip_configuration {
      ipv4_enabled = false
      private_network = var.private_network
    }
  }

  deletion_protection = var.env == "prod"
}

resource "google_sql_database" "dbs" {
  for_each = toset(var.databases)
  name     = each.value
  instance = google_sql_database_instance.primary.name
}
