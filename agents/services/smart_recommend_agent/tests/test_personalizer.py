"""Personalizer — LLM wrapping with structured-output parsing + fallbacks."""
from __future__ import annotations

import pytest

from app.personalizer import _extract_json_array, _parse_output, _fallback, personalize
from app.signals import Signal


# ── parse helpers ────────────────────────────────────────────────────────────


def test_extract_json_array_from_pure_json() -> None:
    raw = '["a", "b", "c"]'
    assert _extract_json_array(raw) == raw


def test_extract_json_array_with_prose_around() -> None:
    raw = 'Sure! Here you go:\n["one", "two"]\nLet me know.'
    extracted = _extract_json_array(raw)
    assert extracted == '["one", "two"]'


def test_extract_json_array_handles_brackets_in_strings() -> None:
    raw = '["foo[bar]", "baz"]'
    extracted = _extract_json_array(raw)
    assert extracted == raw


def test_parse_output_returns_strings_when_lengths_match() -> None:
    out = _parse_output('["alpha", "beta"]', expected=2)
    assert out == ["alpha", "beta"]


def test_parse_output_returns_none_when_length_mismatches() -> None:
    assert _parse_output('["alpha"]', expected=2) is None


def test_parse_output_returns_none_on_garbage() -> None:
    assert _parse_output("not json at all", expected=1) is None


def test_parse_output_accepts_object_form_with_text_field() -> None:
    raw = '[{"i": 0, "text": "hello"}, {"i": 1, "text": "world"}]'
    out = _parse_output(raw, expected=2)
    assert out == ["hello", "world"]


# ── fallback ─────────────────────────────────────────────────────────────────


def test_fallback_combines_title_and_action() -> None:
    s = Signal(
        source="rule.dangerous_vital",
        kind="followup",
        severity="warn",
        title="High BP",
        suggested_action="Talk to your doctor.",
    )
    rec = _fallback(s)
    assert rec.signal is s
    assert "High BP" in rec.text
    assert "doctor" in rec.text


# ── personalize() integration ────────────────────────────────────────────────


async def test_personalize_with_none_provider_falls_back() -> None:
    s = Signal(
        source="rule.dangerous_vital",
        kind="followup",
        severity="warn",
        title="High BP",
        suggested_action="Talk to your doctor.",
    )
    out = await personalize(None, [s])
    assert len(out) == 1
    assert out[0].signal is s
    assert "doctor" in out[0].text.lower()


async def test_personalize_with_empty_signals_returns_empty() -> None:
    out = await personalize(None, [])
    assert out == []


class _ScriptedProvider:
    """LLMProvider stub returning a scripted reply for personalisation tests."""

    def __init__(self, reply: str) -> None:
        self._reply = reply

    def run(self, *, system_prompt, messages, tools, executor, max_tokens=4096):
        from agents.shared import LLMResult

        return LLMResult(reply=self._reply, tool_calls=[], usage={})


async def test_personalize_uses_llm_output_when_valid() -> None:
    s1 = Signal(source="rule.dangerous_vital", kind="followup", severity="warn", title="t1")
    s2 = Signal(source="rule.dangerous_vital", kind="followup", severity="warn", title="t2")
    provider = _ScriptedProvider('["personalised one", "personalised two"]')
    out = await personalize(provider, [s1, s2])
    assert [r.text for r in out] == ["personalised one", "personalised two"]


async def test_personalize_falls_back_on_length_mismatch() -> None:
    s1 = Signal(
        source="rule.dangerous_vital",
        kind="followup",
        severity="warn",
        title="t1",
        suggested_action="action1",
    )
    s2 = Signal(
        source="rule.dangerous_vital",
        kind="followup",
        severity="warn",
        title="t2",
        suggested_action="action2",
    )
    provider = _ScriptedProvider('["just one item"]')  # length mismatch
    out = await personalize(provider, [s1, s2])
    # Should fall back to title+action for both signals.
    assert len(out) == 2
    assert "action1" in out[0].text
    assert "action2" in out[1].text
