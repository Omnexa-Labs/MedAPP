output "network_id" {
  value       = google_compute_network.vpc.id
  description = "VPC id (for module composition: cloud_sql peers against this)."
}

output "network_self_link" {
  value = google_compute_network.vpc.self_link
}

output "subnet_self_link" {
  value = google_compute_subnetwork.primary.self_link
}

output "pods_range_name" {
  value = "pods"
}

output "services_range_name" {
  value = "services"
}

output "private_services_connection" {
  value       = google_service_networking_connection.private.network
  description = "Reference dependency for resources that require the SQL peering to be live."
}
