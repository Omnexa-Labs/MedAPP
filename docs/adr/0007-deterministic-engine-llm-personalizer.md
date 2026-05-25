# ADR 0007 — Deterministic engine + LLM personalizer split

- **Status**: Accepted
- **Date**: 2026-05-22

## Context

The vision document states:

> The LLM should NOT invent recommendations from scratch.
> The recommendation engine generates the signals first.

This is a hard architectural constraint for `smart_recommend_agent` and
`vitals_watcher_agent`. Two failure modes we must avoid:

1. **LLM hallucination.** A patient with normal vitals receives a
   recommendation about glucose simply because the model "thought it
   sounded appropriate."
2. **Severity drift.** A `warn` signal becomes a `critical`-tier alert
   in the model's wording because the LLM dialled up the urgency.

Naive integrations let the LLM look at raw EHR data and write
recommendations directly. That fails both modes.

## Decision

A **strict two-stage split** in both `smart_recommend` and
`vitals_watcher`:

### Stage 1 — Deterministic engine (pure functions)

Lives in `app/rules.py`, `app/patterns.py`, `app/detectors.py`,
`app/analyzer.py`. Takes a pre-built `AnalysisContext` and produces a
list of `Signal` (smart_recommend) or `Anomaly` (vitals_watcher) objects.
**No I/O. No LLM. No imagination.** Each signal carries:

- a stable `dedup_key`
- a severity from a fixed enum
- the `evidence` strings that justify it
- a `suggested_action` template

If the engine produces zero signals, the patient gets nothing. Silence is
correct — no LLM fallback that "tries to find something to say."

### Stage 2 — LLM personalizer (text-only, structured I/O)

Takes the engine's signals as JSON input. Returns exactly `len(signals)`
empathetic patient-facing strings in the same order. **The LLM is not
allowed to:** add new signals, change severity, invent evidence, reorder.
Output-shape mismatches (different length, malformed JSON, missing
fields) trigger a deterministic fallback (`signal.title` +
`signal.suggested_action` verbatim). The patient still gets a message;
the LLM just didn't get to add warmth this time.

### Persistence + notification

Memory writes and push notifications happen from the deterministic side,
keyed on `signal.dedup_key` / `anomaly.dedup_key`. The LLM's only product
is the wording.

## Consequences

- **Good.** Hallucinated recommendations are structurally impossible. A
  pattern detector either fires or it doesn't; the LLM cannot conjure a
  signal that didn't exist.
- **Good.** Severity is the engine's decision. The LLM phrases it; it
  doesn't promote it.
- **Good.** The LLM is genuinely optional. With `provider=mock` the
  fallback path produces serviceable English from the signal's title and
  suggested action.
- **Cost.** Wording quality is capped by the structured-output schema —
  the LLM can't, say, combine three related signals into a single
  graceful paragraph. We trade conversational naturalness for safety.
- **Open question — currently per-signal output.** Should the LLM emit
  one combined message for the whole batch? Not today — order-preserving
  per-signal output is simpler to validate. Revisit if patient feedback
  suggests the feed feels fragmented.

## Where this lives in code

- `agents/services/smart_recommend_agent/app/signals.py` — `Signal` type
- `agents/services/smart_recommend_agent/app/rules.py`,
  `patterns.py`, `analyzer.py` — Stage 1
- `agents/services/smart_recommend_agent/app/personalizer.py` — Stage 2
- `agents/services/vitals_watcher_agent/app/detectors.py` — Stage 1 (acute)
- `agents/services/vitals_watcher_agent/app/dispatcher.py` — runs detectors
  on event; no personalizer (notification body is templated)
