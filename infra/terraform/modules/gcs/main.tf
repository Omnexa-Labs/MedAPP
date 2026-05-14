resource "google_storage_bucket" "uploads" {
  name                        = "medapp-${var.env}-uploads"
  location                    = "EU"
  uniform_bucket_level_access = true
  versioning { enabled = true }
}

resource "google_storage_bucket" "mlflow" {
  name                        = "medapp-${var.env}-mlflow"
  location                    = "EU"
  uniform_bucket_level_access = true
}
