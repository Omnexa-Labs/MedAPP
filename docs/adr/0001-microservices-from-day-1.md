# ADR 0001 — Microservices from day 1

- **Status**: Accepted
- **Date**: 2026-05-14

## Context
Founder/lead decided microservices over a modular monolith despite the higher
upfront infra cost. Rationale: domain boundaries are well understood (patient,
doctor, nurse, hospital, booking, telemedicine, …) and the team plans to scale
each independently (especially telemedicine signaling and ML inference).

## Decision
- 13 backend services, one repo (monorepo).
- One database per service. No cross-service joins.
- Async communication via RabbitMQ topic exchange with CloudEvents envelopes.
- Sync communication via HTTP (httpx clients in `shared/clients`).

## Consequences
- Higher infra + CI cost (per-service builds, per-service migrations).
- Faster vertical ownership; clearer surface for security review.
- Need event schema discipline early — drift across services is the #1 risk.
