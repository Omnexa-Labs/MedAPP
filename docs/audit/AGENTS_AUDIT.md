# Agents Layer Audit

> Scope: `agents/` — services, `agents/shared/`, prompts, tools, and the
> provider abstraction.

## 1. Strengths

- **The provider abstraction is real.** `LLMProvider` in
  `agents/shared/llm.py:41-50` defines a tight interface (`ToolSpec`,
  `ChatTurn`, `LLMResult`). No vendor SDKs (`groq`, `openai`,
  `anthropic`, `google-generativeai`) are imported in core code; they
  are staged as optional extras in `agents/pyproject.toml:16-19`. The
  "swap providers in ~30 lines" claim is plausible once a real adapter
  is written.
- **`MockLLM` is the genuine default.** Deterministic, no network, no
  key (`agents/shared/llm.py:53-89`). CI and dev run without any
  provider configured.
- **System prompts are frozen on disk.** Each agent reads its prompt
  from a Markdown file (`agents/services/*/app/agent.py:17-23`) — no
  f-string assembly with user input, which closes the most common
  prompt-injection vector.
- **Tools pass identity via header**, not URL query string, so
  patient IDs do not land in access logs by accident
  (`concierge_agent/app/tools.py:28-29`).
- **Prompts include "no diagnosis" guardrails** (e.g.
  `prompts/concierge.md:6`, `prompts/lab_reader.md:6`).

## 2. Critical and high-severity findings

| ID | Severity | Finding | Location |
|---|---|---|---|
| A-1 | Critical | Live `GROQ_API_KEY` on disk | `agents/.env:1` (C-1) |
| A-2 | Critical | `/chat` endpoints have no JWT — `patient_id` from request body is the only identity signal, then propagated as `X-Patient-Id` to backends | `agents/services/*/app/base_agent.py:53-55` (C-4) |
| A-3 | High | Tool error paths return raw HTTP error bodies (`r.text`) to the LLM, which can contain PHI from upstream services | `concierge_agent/app/tools.py:135` and similar in other tools |
| A-4 | High | PHI redaction in `agents/shared/phi.py` covers only email, phone, and SSN — not names, MRN, diagnoses, medications, lab values | `agents/shared/phi.py` |
| A-5 | High | No request signing on agent → backend calls; backends cannot distinguish a real agent call from a spoofed `X-Patient-Id` | `concierge_agent/app/tools.py:24-29` |
| A-6 | Medium | `metadata: dict` in `AgentRequest` is untyped and unchecked | `agents/services/*/app/base_agent.py:20-24` |
| A-7 | Medium | Tool outputs are JSON-dumped raw into the LLM context; malformed upstream responses (HTML 502 pages, truncated JSON) confuse the model | All tool wrappers |
| A-8 | Medium | Service token (`service_token`) defaults to `"change-me"` and is sent on every internal call | All agent `config.py` |
| A-9 | Low | Only `concierge_agent` has full tool wiring; the other five agents are stubs but ship the same `/chat` surface | `agents/services/*/app/` |
| A-10 | Low | Zero tests beyond `healthz` | `agents/services/*/tests/` |

## 3. Why A-2, A-3, A-4 matter together

The combination is what makes these critical rather than merely sloppy:

1. `/chat` accepts `patient_id` from the body (A-2).
2. The agent forwards that ID to backend services as `X-Patient-Id`
   (A-5), which some backends will treat as the access-control signal
   in the absence of a verified JWT.
3. When the backend errors, the error body — which may itself contain
   PHI like `"Patient ABC123 has no active bookings"` — is returned to
   the LLM (A-3).
4. PHI redaction misses everything except email, phone, and SSN (A-4),
   so that string lands in the LLM's context, in any future
   conversation log, and in any provider's request history.

Each piece is small. The chain is an IDOR with a PHI exfiltration
multiplier.

## 4. Recommendations

1. **Wrap every agent endpoint in a JWT dependency.** Derive
   `patient_id` from the `sub` claim — never from the body.
2. **Sign agent → backend calls.** Either mTLS inside the cluster or a
   short-lived HMAC over `(method, path, body_hash, timestamp)` with a
   per-environment shared secret. Backends should reject `X-Patient-Id`
   when the signature is absent.
3. **Redact tool error bodies before they re-enter the LLM context.**
   The safe default is to log the raw error and return a sanitised
   `{"error": "upstream_failed", "code": <status>}` to the model.
4. **Expand `phi.py`.** Layer regex (phone, email, SSN, NHS-style IDs,
   common date formats) with a name-detection pass (a small spaCy
   model, or the HIPAA Safe Harbor 18 identifiers as a checklist).
   Apply redaction in both directions — on tool outputs going *to* the
   LLM, and on LLM outputs going to logs/traces.
5. **Rate-limit `/chat` per user** at the agent layer; LLM calls are
   expensive enough that a runaway client is a billing event.
6. **Define and validate `metadata`** with a Pydantic model. Reject
   unknown keys.
7. **Mark the five stub agents as `experimental`** in the README and
   keep their `/chat` route disabled until they have tool wiring and
   tests.
8. **Add integration tests for IDOR**: assert that a token for user A
   cannot retrieve user B's EHR through any agent's tool chain.

## 5. What is *not* a problem (yet)

- The provider abstraction. It is one of the cleanest pieces of the
  codebase and should be preserved as-is when the first real adapter
  lands.
- Prompt assembly. System prompts are loaded from disk and user input
  is appended as a separate `ChatTurn`, which is the right shape.
- Vendor leakage. There is none today — keep it that way by linting
  for `from groq|openai|anthropic|google` imports in the core
  packages.
