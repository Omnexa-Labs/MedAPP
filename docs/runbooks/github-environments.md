# GitHub Environments — one-time setup

This is a one-time operator task in the GitHub UI. The protection rules
live in GitHub's "Environments" feature, not in YAML — you click them
once per environment after creating the repo.

## Why

The deploy workflows (`deploy-dev.yml`, `deploy.yml`) reference
`environment: dev | staging | prod`. GitHub uses the matching
Environment's secrets AND pauses the job at the environment-resolution
step until the protection rules are satisfied (required reviewer, wait
timer). Without the rules set, prod deploys go through with zero
oversight.

## Per-environment configuration

Repo Settings → Environments → "New environment" for each of: `dev`,
`staging`, `prod`.

### dev

- **Deployment protection rules**: none.
- **Allowed branches**: `main` only.
- **Secrets** (from the dev bootstrap stack's outputs, plus the env
  stack's outputs):
  - `GCP_WIF_PROVIDER`         — bootstrap output `workload_identity_provider`
  - `GCP_DEPLOYER_SA`          — bootstrap output `ci_deployer_sa_email`
  - `GCP_PROJECT`              — `medapp-dev`
  - `GCP_TFSTATE_BUCKET`       — bootstrap output `tfstate_bucket`

### staging

- **Deployment protection rules**:
  - Required reviewers: at least 1 (pick whoever owns merges to main).
- **Allowed branches**: `main` only.
- **Secrets**: same shape as dev, with `medapp-staging` project id.

### prod

- **Deployment protection rules**:
  - Required reviewers: at least 2 (no self-approval — the workflow
    initiator cannot also approve).
  - Wait timer: 30 minutes (forces a deliberate pause; lets an
    accidental dispatch be cancelled).
- **Allowed branches**: `main` only.
- **Secrets**: same shape as dev, with `medapp-prod` project id.

## Why these settings

- **Allowed branches = main only**: a deploy from a feature branch
  could carry image refs the build pipeline hasn't scanned + signed.
- **Required reviewers on staging + prod**: gives the team a human
  checkpoint between "auto-deployed to dev" and "lands on real
  users". Slice 4's Cosign verification + Slice 5's Binary
  Authorization both happen at deploy time; the reviewer rule is the
  human layer.
- **Wait timer on prod**: catches "wrong workflow_dispatch" mistakes.
  An operator can cancel the run within 30 minutes if they realise
  they typed the wrong image_tag.
- **No self-approval on prod**: separation of duties is required by
  many compliance frameworks (SOC 2, HIPAA's administrative
  safeguards). Even with a one-person team, enable this — it forces
  you to wait until a second reviewer joins.

## Rollback

To roll back, re-run `deploy.yml` with `image_tag` set to a known-good
prior commit SHA. The image is still in Artifact Registry because the
bootstrap module set `immutable_tags = true` on prod and tags can't be
overwritten. Helm `--install` is idempotent; this re-applies the older
image without any state drift.

## What's NOT configured by clicking these settings

- The Workload Identity Federation binding (already done by the
  bootstrap module — slice 1).
- The CI deployer SA's IAM grants (already done by the bootstrap
  module — slice 1).
- The cluster + database + secrets (already done by the env stack —
  slices 2 + 4 + 5).

So this runbook page is just the GitHub-side gates. Everything else
is in Terraform.
