"""LLM personalizer.

Takes a list of `Signal` (deterministic, structured) and produces a list of
`PersonalizedRecommendation` (empathetic, plain-English, patient-facing).

Critical constraint (vision doc):
    "The LLM should NOT invent recommendations from scratch."
    "The recommendation engine generates the signals first."

We enforce this with a strict input/output contract:
- Input is `len(signals)` rows of structured JSON.
- The LLM is asked to return exactly `len(signals)` rows of personalised
  text, preserving order, referring only to the `evidence` we provided.
- If the LLM returns a different count or unparseable JSON, we fall back to
  the signal's `title + suggested_action` verbatim. The user still gets a
  message; the LLM just didn't get to add empathy this time.

One LLM call per analysis run. No tools — this is text-only. Memory writes
happen in `agent.py`, not here.
"""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass

from agents.shared import LLMChatTurn, LLMProvider, prompt_path

from .signals import Signal

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PersonalizedRecommendation:
    signal: Signal
    text: str  # what the patient actually sees


_PERSONALIZER_PROMPT_PATH = prompt_path("_smart_recommend_personalizer.md")


def _load_prompt() -> str:
    try:
        return _PERSONALIZER_PROMPT_PATH.read_text(encoding="utf-8")
    except OSError:
        logger.warning("personalizer.prompt_missing path=%s", _PERSONALIZER_PROMPT_PATH)
        return ""


async def personalize(
    provider: LLMProvider | None,
    signals: list[Signal],
    *,
    max_tokens: int = 800,
) -> list[PersonalizedRecommendation]:
    """Wrap each signal in empathetic patient-facing text.

    `provider` may be None — in that case we use the fallback formatter for
    every signal. That's the same behaviour as a provider failure, so the
    LLM is genuinely *optional* for this layer.
    """
    if not signals:
        return []
    if provider is None:
        return [_fallback(s) for s in signals]

    prompt = _load_prompt()
    if not prompt:
        return [_fallback(s) for s in signals]

    user_payload = json.dumps(
        [
            {
                "i": i,
                "title": s.title,
                "kind": s.kind,
                "severity": s.severity,
                "evidence": s.evidence,
                "suggested_action": s.suggested_action,
            }
            for i, s in enumerate(signals)
        ],
        ensure_ascii=False,
    )
    messages = [LLMChatTurn(role="user", content=user_payload)]

    def _run():
        return provider.run(
            system_prompt=prompt,
            messages=messages,
            tools=[],
            executor=lambda *_: "",
            max_tokens=max_tokens,
        )

    try:
        result = await asyncio.to_thread(_run)
    except Exception:
        logger.exception("personalizer.llm_call_failed")
        return [_fallback(s) for s in signals]

    parsed = _parse_output(result.reply, expected=len(signals))
    if parsed is None:
        logger.warning("personalizer.bad_output falling_back len_signals=%s", len(signals))
        return [_fallback(s) for s in signals]
    return [
        PersonalizedRecommendation(signal=signals[i], text=parsed[i]) for i in range(len(signals))
    ]


# ── Helpers ──────────────────────────────────────────────────────────────────


def _fallback(signal: Signal) -> PersonalizedRecommendation:
    text = signal.title
    if signal.suggested_action:
        text = f"{text}. {signal.suggested_action}"
    return PersonalizedRecommendation(signal=signal, text=text)


def _parse_output(raw: str, *, expected: int) -> list[str] | None:
    """Lenient JSON-array parse. Accepts pure JSON or JSON with prose around it.

    Required shape: a JSON array of strings (or objects with `i` + `text`)
    of length exactly `expected`. Anything else → None and we fall back.
    """
    raw = (raw or "").strip()
    if not raw:
        return None
    # MockLLM prefixes "(mock) you said: ..." then echoes input. Try to
    # extract the JSON array from anywhere in the output.
    payload = _extract_json_array(raw)
    if payload is None:
        return None
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, list) or len(data) != expected:
        return None
    out: list[str] = []
    for item in data:
        if isinstance(item, str):
            out.append(item.strip())
        elif isinstance(item, dict) and isinstance(item.get("text"), str):
            out.append(item["text"].strip())
        else:
            return None
    if not all(out):
        return None
    return out


def _extract_json_array(text: str) -> str | None:
    """Find the outermost JSON array in `text`. Handles balanced brackets."""
    start = text.find("[")
    if start < 0:
        return None
    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if escape:
            escape = False
            continue
        if ch == "\\":
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None
