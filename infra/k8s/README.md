# Kubernetes

Two complementary approaches kept side by side — use whichever fits the rollout:

- **`k8s/`** — Kustomize base + overlays. Good for raw manifests, simple GitOps with Argo CD.
- **`helm/medapp/`** — Helm chart that templates the same services. Good for parametrised installs (multi-region, multi-tenant later).

Pick one per environment. Don't apply both to the same cluster.

CI builds and pushes images to Artifact Registry; Argo CD or Helmfile reconciles them onto GKE.
