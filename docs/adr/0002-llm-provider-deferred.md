# ADR 0002 — LLM provider deferred

- **Status**: Accepted
- **Date**: 2026-05-14

## Context
The agent layer (`agents/`) needs an LLM to drive tool use and conversation. We
do not want to commit to a vendor before evaluating quality, cost, latency,
HIPAA BAA terms, and self-hosting feasibility for our specific tasks
(triage, recommendations, lab reading, vitals anomalies, booking).

## Decision
- Introduce an `LLMProvider` interface in `agents/shared/llm.py` with three
  primitives: `ToolSpec`, `ChatTurn`, `LLMResult`.
- Default provider is `MockLLM` — deterministic, no network, no key. Dev and CI
  use it; the agent /chat endpoint works out of the box.
- No vendor SDK is imported by default. Each provider lives behind an optional
  extra in `agents/pyproject.toml` (`agents[openai]`, `agents[anthropic]`,
  `agents[google]`).
- Switching is one env var per agent (`<AGENT>_LLM_PROVIDER`) once the provider
  module is implemented.

## Consequences
- Frontend and backend teams unblocked — agents respond deterministically without any cloud account.
- We pay an abstraction tax: a thin layer of `ToolSpec` ↔ provider conversion when each provider is added (~30–50 lines per provider).
- Risk: subtle provider differences (tool-call format, system-prompt placement, function-calling vs tool-use semantics) may leak through. Mitigation: keep the interface small and run the same eval suite against every provider before adoption.
- Evaluation needed before picking: cost per agent turn at projected volume, P95 latency, HIPAA BAA availability, vision support (needed by `lab_reader_agent`), context window for long EHR summaries.
