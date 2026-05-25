# medapp-platform chart

One-time cluster install. Run by an operator BEFORE the first
`medapp` app deploy with `externalSecrets.enabled=true`.

## What it installs

- **External Secrets Operator** (upstream chart `external-secrets/external-secrets@0.10.x`).
- **K8s ServiceAccount `external-secrets-reader`** in the medapp
  namespace, annotated with `iam.gke.io/gcp-service-account` pointing
  at the GSM-reader GSA created by the Terraform secret_manager module.
- **ClusterSecretStore `gcp-secret-manager`** that ESO uses to talk to
  Google Secret Manager via Workload Identity.

## Prerequisites

1. The bootstrap stack must have been applied (per Slice 1) so the
   project, WIF, and Artifact Registry exist.
2. The main env stack must have been applied (per Slices 2 + 4 + 5) so
   the GKE Autopilot cluster + per-service GSAs + GSM secrets exist.
3. The GSM-reader GSA must exist. Slice 5's secret_manager module
   creates it via the `service_identity` module call for the
   `external-secrets-reader` "pseudo-service" — see
   infra/terraform/envs/<env>/main.tf.

## Install

```bash
helm dependency update infra/helm/platform
helm upgrade --install platform infra/helm/platform \
  --namespace external-secrets --create-namespace \
  --set projectId=medapp-dev \
  --set namespace=medapp-dev \
  --set externalSecretsAuth.gsaEmail=external-secrets-reader-wi@medapp-dev.iam.gserviceaccount.com \
  --wait
```

Repeat for staging and prod.

## After install

Switch `externalSecrets.enabled` in the medapp chart values to `true`
and redeploy. The ExternalSecret resources will start projecting GSM
secrets into per-service K8s Secrets.

## Operator runbook: setting a secret

Each service has a single GSM secret `medapp-<env>-<service>` (e.g.
`medapp-prod-payment-service`). Payload is a JSON object — keys
become env vars in the pod.

```bash
echo '{"DATABASE_URL":"postgres://...","JWT_SECRET":"..."}' \
  | gcloud secrets versions add medapp-prod-payment-service --data-file=-
```

ESO picks up the new version within `refreshInterval` (default 1h).
For an immediate rotation, restart the deployment:

```bash
kubectl rollout restart deployment/payment-service -n medapp-prod
```
