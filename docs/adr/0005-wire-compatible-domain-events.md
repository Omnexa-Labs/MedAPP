# ADR 0005 — Wire-compatible domain events between backend and agents

- **Status**: Accepted
- **Date**: 2026-05-22

## Context

`backend/shared/shared/events/` defines a `DomainEvent` (CloudEvents-shaped:
`id`, `type`, `source`, `subject`, `time`, `data`, `specversion`) and an
`EventBus` over RabbitMQ topic exchange `medapp.events`. Backend services
publish events through it; the agent layer needs to consume them
(`smart_recommend_agent`, `vitals_watcher_agent`) and publish new ones
(`vitals_watcher_agent` emits `vitals.anomaly.detected`).

The agents are a separate `uv` project. The two options for the contract:

1. Import `shared.events` from the agent layer as a Python dependency.
2. Mirror the schema and the wire format in `agents/shared/events.py`,
   with no Python-level coupling.

## Decision

**Option 2: mirror the schema.** `agents/shared/events.py` defines a
`DomainEvent` Pydantic model with exactly the same fields as the backend's
`shared/events/schema.py` — `id`, `type`, `source`, `subject`, `time`,
`data`, `specversion`. It defines `EventSubscriber` and `EventPublisher`
classes that use `aio-pika` directly. The exchange name (`medapp.events`)
and the routing-key-equals-event-type convention are duplicated as
constants.

A pin-test (`test_domain_event_matches_backend_wire_shape`) asserts the
field set in the agent-side schema. If either side drifts, the test fails
loudly.

## Consequences

- **Good.** The agent workspace and the backend workspace can be deployed
  independently. They share a JSON contract, not a Python module.
- **Good.** `aio-pika` is loaded lazily in the agent-side `EventSubscriber`
  / `EventPublisher`. Unit tests don't need the `agents[events]` extra
  installed.
- **Cost.** Two definitions of the same schema. Drift risk is real, hence
  the pin-test. When the schema changes (rare — it follows CloudEvents 1.0),
  both files must change together.
- **Open question — partially addressed.** Should we generate the agent
  schema from the backend's at build time? Yes eventually; the schema is
  small enough that manual duplication is fine for now and easier to read.
