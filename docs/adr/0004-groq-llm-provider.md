# ADR 0004 — Groq as first concrete LLM provider

- **Status**: Proposed
- **Date**: 2026-05-21

## Context

ADR 0002 deferred the choice of LLM provider and shipped a `MockLLM` default
behind the `LLMProvider` interface. Development now needs a real LLM:

- We need to validate tool-calling end-to-end, which `MockLLM` only simulates.
- We need realistic latency/quality numbers to size context windows and the
  memory compression budget (ADR 0003).
- The team has working Groq credentials and an OpenAI-compatible internal
  proxy already provisioned.

Groq is **not HIPAA-covered**. Real patient data cannot be sent to it under
our compliance posture. OpenAI (direct or via Azure) under BAA is the
intended *production* provider.

## Decision

- Implement `GroqProvider` in `agents/shared/providers/groq_provider.py`
  behind the extra `agents[groq]` in `agents/pyproject.toml`. Default model:
  `llama-3.3-70b-versatile` (strongest tool-use among Groq's catalogue as of
  the audit window). Configurable via `<AGENT>_LLM_MODEL`.
- Implement `OpenAIProvider` in `agents/shared/providers/openai_provider.py`
  behind the existing extra `agents[openai]`. Default model:
  `gpt-4.1-mini` (cheap, supports parallel tool calls, BAA available). The
  same provider class works against Azure OpenAI by setting
  `OPENAI_BASE_URL`.
- **Selection**: same pattern as `LLMProvider` — `make_provider("groq" | "openai" | "mock")`
  registered in `agents/shared/llm.py`. No agent code changes.
- **Environment gating**: a new env-level guard. When
  `ENV=production` and `LLM_PROVIDER=groq`, startup fails with a loud error.
  This prevents accidentally routing PHI to a non-BAA provider.
- **Tool-calling adapter**: each provider converts our vendor-neutral
  `ToolSpec` into its native schema (`tools` for OpenAI, `tools` for Groq
  which mirrors OpenAI). The adapter lives inside the provider module — no
  bleed into agent code.
- **Streaming**: out of scope for this ADR. Both providers support streaming;
  we'll add it when the mobile client needs token-stream UX. Until then,
  block-on-completion is fine.

## Rejected alternatives

- **OpenAI first**: better quality but slower iteration in dev. We pay more
  per request and there's no proxy I can hammer at zero marginal cost.
- **Anthropic Claude**: ADR 0002 keeps it on the table; `lab_reader_agent`
  may need it for vision. Out of scope here — adding it is a follow-up
  provider module.
- **Router that picks per-agent at runtime**: tempting but premature. Two
  providers + an env flag covers every dev/staging/prod combination we have
  today. The router becomes worth building when we have ≥3 providers AND a
  cost/latency policy that varies per agent.

## Consequences

- Dev/staging agents can now actually drive tools end-to-end against Groq.
  Concierge agent goes from "echoes input" to "books appointments" in dev.
- Production stays safe by config: Groq is unreachable when `ENV=production`.
- Cost: each provider adds ~50–80 lines + tests. We commit to maintaining the
  adapter as the providers evolve their tool-calling APIs (OpenAI changed
  `functions` → `tools` once already).
- **Open question — left for implementation**: whether to share an
  `OpenAICompatibleProvider` base that both Groq and OpenAI (and later
  Together, Fireworks, vLLM) inherit from. Proposing yes — the wire format
  is identical; only the base URL, model name, and capability flags differ.
