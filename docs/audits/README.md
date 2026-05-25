# MedAPP Audit Reports

This directory contains principal-engineer-level audits of the MedAPP healthcare platform.
Each audit covers **strengths**, **flaws**, **security breaches**, and **improvement
recommendations** for a specific area of the system.

## Naming convention

```
YYYY-MM-DD-<scope>-audit.md
```

- `YYYY-MM-DD` — date the audit was produced (ISO 8601)
- `<scope>` — area covered: `executive-summary`, `backend`, `frontend`, `infrastructure`, `project-docs`

## Severity tags used throughout

| Tag | Meaning |
| --- | --- |
| **CRITICAL** | Active exploitable risk or production blocker. Fix before next deploy. |
| **HIGH** | Significant security or correctness issue. Fix this sprint. |
| **MEDIUM** | Quality or hardening issue. Fix in the current quarter. |
| **LOW** | Polish, defense-in-depth, or nice-to-have. |

## Index

| File | Scope |
| ---- | ----- |
| [2026-05-20-executive-summary-audit.md](./2026-05-20-executive-summary-audit.md) | Cross-cutting findings, top-10 risks, action plan |
| [2026-05-20-backend-audit.md](./2026-05-20-backend-audit.md) | All 18 backend microservices + shared utilities |
| [2026-05-20-frontend-audit.md](./2026-05-20-frontend-audit.md) | admin_web, hms_web, pms_web, mobile (React Native) |
| [2026-05-20-infrastructure-audit.md](./2026-05-20-infrastructure-audit.md) | Docker, Kubernetes, Helm, Terraform, CI pipelines |
| [2026-05-20-project-docs-audit.md](./2026-05-20-project-docs-audit.md) | Documentation, ADRs, runbooks, compliance posture |

## How to use these reports

1. **Start with the executive summary** for the prioritised action plan.
2. Drill into the scope-specific report for line-level findings and citations.
3. Track remediation in your issue tracker; reference the audit file and the severity tag.
4. Re-audit after major remediation milestones (recommend quarterly cadence).
