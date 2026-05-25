output "uploads_bucket" {
  value = google_storage_bucket.uploads.name
}

output "mlflow_bucket" {
  value = google_storage_bucket.mlflow.name
}
