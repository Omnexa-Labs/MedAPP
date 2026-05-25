output "policy_name" {
  value       = google_compute_security_policy.main.name
  description = "Pass to Helm chart as `--set ingress.cloudArmorPolicy=<value>`. The chart's BackendConfig references this policy name."
}

output "policy_self_link" {
  value = google_compute_security_policy.main.self_link
}
