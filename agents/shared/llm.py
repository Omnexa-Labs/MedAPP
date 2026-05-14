"""LLM provider abstraction.

The goal is to keep agent code (`agent.py`, `tools.py`, prompts) free of any
vendor SDK. When you pick a provider, implement `LLMProvider` in this file or
in a sibling module and register it in `make_provider()`.

The interface is intentionally small: take a system prompt + messages + tool
schemas + a tool executor, run the agentic loop, return the final reply plus
usage counters. Nothing else leaks.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Protocol


@dataclass
class ToolSpec:
    name: str
    description: str
    input_schema: dict[str, Any]


@dataclass
class ChatTurn:
    role: str  # "user" | "assistant"
    content: str


@dataclass
class LLMResult:
    reply: str
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    usage: dict[str, int] = field(default_factory=dict)


# A tool executor is a sync function that takes (name, input_json) and returns a string result.
ToolExecutor = Callable[[str, dict[str, Any]], str]


class LLMProvider(Protocol):
    def run(
        self,
        *,
        system_prompt: str,
        messages: list[ChatTurn],
        tools: list[ToolSpec],
        executor: ToolExecutor,
        max_tokens: int = 4096,
    ) -> LLMResult: ...


class MockLLM:
    """Deterministic stand-in used in dev and CI.

    - Echoes the last user message
    - If any tool name appears in the message text, "calls" that tool once and
      includes its result in the reply. This lets you smoke-test tool wiring
      without a real LLM.
    """

    def run(
        self,
        *,
        system_prompt: str,
        messages: list[ChatTurn],
        tools: list[ToolSpec],
        executor: ToolExecutor,
        max_tokens: int = 4096,
    ) -> LLMResult:
        last_user = next((m.content for m in reversed(messages) if m.role == "user"), "")
        tool_calls: list[dict[str, Any]] = []
        tool_outputs: list[str] = []

        for spec in tools:
            if spec.name in last_user:
                # The mock has no real arguments — pass an empty dict and let the
                # tool decide what to do. Real providers fill input from the model.
                result = executor(spec.name, {})
                tool_calls.append({"name": spec.name, "input": {}})
                tool_outputs.append(f"[{spec.name}] {result}")

        reply_parts = [f"(mock) you said: {last_user}"]
        reply_parts.extend(tool_outputs)
        return LLMResult(
            reply="\n".join(reply_parts),
            tool_calls=tool_calls,
            usage={"input_tokens": 0, "output_tokens": 0},
        )


def make_provider(name: str) -> LLMProvider:
    """Factory. Add new providers here as you implement them.

    Keep each branch tiny — the real implementation lives in its own module so
    we don't pull vendor SDKs into the import graph unless that provider is selected.
    """
    name = name.lower()
    if name == "mock":
        return MockLLM()
    # Example shapes — uncomment and implement when you pick a provider:
    # if name == "openai":
    #     from .providers.openai_provider import OpenAIProvider
    #     return OpenAIProvider()
    # if name == "anthropic":
    #     from .providers.anthropic_provider import AnthropicProvider
    #     return AnthropicProvider()
    # if name == "google":
    #     from .providers.google_provider import GoogleProvider
    #     return GoogleProvider()
    raise ValueError(
        f"Unknown LLM_PROVIDER={name!r}. Implement it in agents/shared/llm.py "
        "and register it in make_provider()."
    )
