"""Tests for the OpenAI-compatible provider base.

We do not require a live OpenAI account — we monkeypatch `openai.OpenAI`
before constructing the provider, so the SDK package is the only dependency.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pytest

pytest.importorskip("openai")

from agents.shared.llm import ChatTurn, ToolSpec  # noqa: E402
from agents.shared.providers.openai_compat import OpenAICompatProvider  # noqa: E402


# ── Fake OpenAI client ──────────────────────────────────────────────────────


@dataclass
class _Func:
    name: str
    arguments: str


@dataclass
class _ToolCall:
    id: str
    function: _Func


@dataclass
class _Msg:
    content: str | None = None
    tool_calls: list[_ToolCall] | None = None


@dataclass
class _Choice:
    message: _Msg


@dataclass
class _Usage:
    prompt_tokens: int = 0
    completion_tokens: int = 0


@dataclass
class _Resp:
    choices: list[_Choice]
    usage: _Usage


class _FakeChatCompletions:
    def __init__(self, scripted: list[_Resp]) -> None:
        self._scripted = list(scripted)
        self.calls: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> _Resp:
        self.calls.append(kwargs)
        if not self._scripted:
            raise AssertionError("FakeChatCompletions ran out of scripted responses")
        return self._scripted.pop(0)


class _FakeChat:
    def __init__(self, completions: _FakeChatCompletions) -> None:
        self.completions = completions


class _FakeOpenAI:
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        # Captured by the test via the scripted_responses fixture.
        self.chat = _FakeChat(_SCRIPTED_RESPONSES.pop(0))


_SCRIPTED_RESPONSES: list[_FakeChatCompletions] = []


# ── Test subclass ───────────────────────────────────────────────────────────


class _DummyProvider(OpenAICompatProvider):
    env_key_var = "DUMMY_API_KEY"
    default_base_url = "https://example.test/v1"
    default_model = "dummy-1"
    max_tool_iterations = 3


@pytest.fixture(autouse=True)
def patch_openai(monkeypatch: pytest.MonkeyPatch) -> None:
    import openai
    monkeypatch.setattr(openai, "OpenAI", _FakeOpenAI)
    monkeypatch.setenv("DUMMY_API_KEY", "test-key")
    _SCRIPTED_RESPONSES.clear()


def _resp_text(text: str) -> _Resp:
    return _Resp(choices=[_Choice(message=_Msg(content=text))], usage=_Usage(5, 10))


def _resp_tool_call(name: str, args: str, tool_call_id: str = "t1") -> _Resp:
    return _Resp(
        choices=[
            _Choice(
                message=_Msg(
                    content=None,
                    tool_calls=[_ToolCall(id=tool_call_id, function=_Func(name, args))],
                )
            )
        ],
        usage=_Usage(8, 0),
    )


def test_simple_completion_returns_content() -> None:
    _SCRIPTED_RESPONSES.append(_FakeChatCompletions([_resp_text("hello there")]))
    p = _DummyProvider()
    result = p.run(
        system_prompt="sys",
        messages=[ChatTurn(role="user", content="hi")],
        tools=[],
        executor=lambda *_: "",
    )
    assert result.reply == "hello there"
    assert result.tool_calls == []
    assert result.usage["input_tokens"] == 5
    assert result.usage["output_tokens"] == 10


def test_single_tool_call_loop() -> None:
    _SCRIPTED_RESPONSES.append(
        _FakeChatCompletions(
            [
                _resp_tool_call("get_ehr_summary", "{}"),
                _resp_text("patient looks fine"),
            ]
        )
    )
    p = _DummyProvider()
    executed: list[tuple[str, dict[str, Any]]] = []

    def executor(name: str, args: dict[str, Any]) -> str:
        executed.append((name, args))
        return '{"conditions": ["asthma"]}'

    spec = ToolSpec(
        name="get_ehr_summary",
        description="summary",
        input_schema={"type": "object", "properties": {}, "required": []},
    )
    result = p.run(
        system_prompt="sys",
        messages=[ChatTurn(role="user", content="how am i?")],
        tools=[spec],
        executor=executor,
    )
    assert result.reply == "patient looks fine"
    assert executed == [("get_ehr_summary", {})]
    assert result.tool_calls == [{"name": "get_ehr_summary", "input": {}}]


def test_tool_loop_exhaustion_returns_fallback() -> None:
    # max_tool_iterations is 3; script 4 tool calls so the loop never finishes.
    _SCRIPTED_RESPONSES.append(
        _FakeChatCompletions(
            [_resp_tool_call("get_ehr_summary", "{}") for _ in range(4)]
        )
    )
    p = _DummyProvider()
    spec = ToolSpec(
        name="get_ehr_summary",
        description="summary",
        input_schema={"type": "object", "properties": {}, "required": []},
    )
    result = p.run(
        system_prompt="sys",
        messages=[ChatTurn(role="user", content="loop")],
        tools=[spec],
        executor=lambda *_: '{"ok": true}',
    )
    assert "ran out of steps" in result.reply.lower()
    assert len(result.tool_calls) == 3
