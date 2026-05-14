# Deploy

We deploy on tag (`v*`) or via the `deploy` workflow_dispatch.

## Flow
1. `backend-build` builds & pushes one image per service to Artifact Registry, tagged with `${git_sha}` and `latest`.
2. `deploy` (manual) runs `helm upgrade --install` against the target GKE cluster.
3. Helm uses `image.tag` from the workflow input.
4. Canary: change `strategy.rollingUpdate.maxSurge` and watch SLOs in Grafana before completing rollout.

## Rollback
- `helm rollback medapp <revision>` to the previous revision.
- Or redeploy via the workflow with the previous git sha as `image_tag`.

## Database migrations
Migrations are not auto-run by Helm. Run them as Kubernetes Jobs (one per service) before promoting traffic. See `infra/k8s/base/jobs/migrate-*.yaml` (TODO).
