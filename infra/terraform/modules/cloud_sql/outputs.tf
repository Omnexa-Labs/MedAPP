output "instance_name" {
  value = google_sql_database_instance.primary.name
}

output "instance_connection_name" {
  value       = google_sql_database_instance.primary.connection_name
  description = "Format: <project>:<region>:<instance>. Cloud SQL Auth Proxy uses this."
}

output "private_ip_address" {
  value = google_sql_database_instance.primary.private_ip_address
}

output "databases" {
  value = [for db in google_sql_database.dbs : db.name]
}
