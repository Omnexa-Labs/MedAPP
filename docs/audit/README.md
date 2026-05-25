# MedApp Engineering Audit — 2026-05-20

> A principal-engineer-level walkthrough of the entire MedApp repository
> covering strengths, flaws, security exposure, and prioritised improvements
> across backend, agents, frontend, and infrastructure.

This index is the entry point for the audit. Each linked document is
self-contained and can be reviewed independently.

## How this audit was produced

The audit was performed against the working tree at commit `15d5501`
(`feat: Add hospital management services and refactor mobile app to React
Native`) on 2026-05-20. Four parallel reviews — backend services, agents
layer, frontends, and infrastructure/CI — were conducted by reading source,
configuration, IaC, and CI workflows. Findings are cross-referenced by
file path and line number wherever possible.

## Documents

| # | Document | Scope |
|---|---|---|
| 00 | [EXECUTIVE_SUMMARY.md](./EXECUTIVE_SUMMARY.md) | One-page overview, headline risks, and recommended sequencing |
| 01 | [CRITICAL_FINDINGS.md](./CRITICAL_FINDINGS.md) | The handful of issues that must be addressed before any production deployment |
| 02 | [BACKEND_AUDIT.md](./BACKEND_AUDIT.md) | All 18 FastAPI services + `backend/shared/` |
| 03 | [AGENTS_AUDIT.md](./AGENTS_AUDIT.md) | LLM agent layer, PHI handling, provider abstraction |
| 04 | [FRONTEND_AUDIT.md](./FRONTEND_AUDIT.md) | Mobile (React Native), `admin_web`, `pms_web`, `hms_web` |
| 05 | [INFRASTRUCTURE_AUDIT.md](./INFRASTRUCTURE_AUDIT.md) | Terraform, Kubernetes, Docker Compose, GitHub Actions |
| 06 | [SECURITY_FINDINGS.md](./SECURITY_FINDINGS.md) | Consolidated security register with severity rating |
| 07 | [REMEDIATION_ROADMAP.md](./REMEDIATION_ROADMAP.md) | Sequenced fix plan with owner-agnostic effort estimates |

## Severity scale used in this audit

| Severity | Meaning |
|---|---|
| **Critical** | Direct path to data loss, takeover, or PHI exfiltration. Fix before any external exposure. |
| **High** | Material risk to confidentiality, integrity, or availability under realistic conditions. Fix within the current sprint. |
| **Medium** | Defensible weakness or correctness gap. Schedule into the next planning cycle. |
| **Low** | Hygiene, drift, or documentation. Address opportunistically. |
| **Info** | Strength worth preserving or convention worth codifying. |

## Reading order

If you only have ten minutes, read `EXECUTIVE_SUMMARY.md` and
`CRITICAL_FINDINGS.md`. If you are scoping a hardening sprint, read
`REMEDIATION_ROADMAP.md` after the executive summary.
