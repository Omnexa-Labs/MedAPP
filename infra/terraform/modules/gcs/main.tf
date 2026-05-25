# Application GCS buckets.
#
# Two buckets per env:
#
#   - `<project>-uploads`  — user-uploaded files (lab results PDFs, profile
#     photos). Versioning on so a buggy overwrite is recoverable. 30-day
#     non-current retention keeps storage cost bounded.
#   - `<project>-mlflow`   — model + experiment artifacts. No versioning
#     (artifacts are immutable; if the run id changes the path changes).
#
# Both buckets:
#   - Uniform bucket-level access (legacy ACLs cannot create surprises).
#   - public_access_prevention = "enforced" (no public reads ever, even
#     if someone fat-fingers an IAM grant).
#   - Soft delete enabled for 7 days so an accidental delete is
#     recoverable (the GCP-managed equivalent of object versioning).

resource "google_storage_bucket" "uploads" {
  project                     = var.project_id
  name                        = "${var.project_id}-uploads"
  location                    = var.location
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = var.env != "prod"

  versioning {
    enabled = true
  }

  soft_delete_policy {
    retention_duration_seconds = 7 * 24 * 3600
  }

  dynamic "encryption" {
    for_each = var.kms_key_name != "" ? [1] : []
    content {
      default_kms_key_name = var.kms_key_name
    }
  }

  lifecycle_rule {
    condition {
      age        = 30
      with_state = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }

  # Prod protection is provided by `force_destroy = false` on the prod
  # bucket above. `lifecycle.prevent_destroy` can't be env-conditional
  # because Terraform requires it to be a literal — and we don't want
  # the rule on dev/staging, where developers may need to teardown.
}

resource "google_storage_bucket" "mlflow" {
  project                     = var.project_id
  name                        = "${var.project_id}-mlflow"
  location                    = var.location
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = var.env != "prod"

  soft_delete_policy {
    retention_duration_seconds = 7 * 24 * 3600
  }

  dynamic "encryption" {
    for_each = var.kms_key_name != "" ? [1] : []
    content {
      default_kms_key_name = var.kms_key_name
    }
  }
}
