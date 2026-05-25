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


@dataclass
class ImagePart:
    """Vision input attached to the most recent user `ChatTurn`.

    Providers that support vision (OpenAI 4o / 4.1) translate these into
    their native multimodal content shape. Providers that don't support
    vision should raise `NotImplementedError` when this is non-empty —
    the agent layer decides whether to fall back or error.
    """

    data: bytes
    media_type: str  # e.g. "image/png", "image/jpeg"
    # Optional human label used by some providers for caching / logging.
    detail: str = "auto"  # OpenAI: "low" | "high" | "auto"


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
        images: list[ImagePart] | None = None,
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
        images: list[ImagePart] | None = None,
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
        if images:
            # Surface the image-count so vision-path tests can assert the
            # mock saw the attachment without needing a real provider.
            reply_parts.append(f"(mock) saw {len(images)} image(s)")
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

    Production guard (ADR 0004): selecting a non-BAA provider when
    `ENV=production` fails loudly at startup. Today that means Groq is
    blocked in production.
    """
    import os

    name = name.lower()
    env = os.getenv("ENV", "").lower()
    non_baa = {"groq", "mock"}
    if env == "production" and name in non_baa:
        raise RuntimeError(
            f"LLM_PROVIDER={name!r} is not permitted when ENV=production. "
            "Groq is not HIPAA-covered; use 'openai' (under BAA) for production."
        )

    if name == "mock":
        return MockLLM()
    if name == "groq":
        from .providers.groq_provider import GroqProvider
        return GroqProvider()
    if name == "openai":
        from .providers.openai_provider import OpenAIProvider
        return OpenAIProvider()
    # Future providers slot in here. Keep the import lazy so each branch only
    # pulls its SDK when selected.
    raise ValueError(
        f"Unknown LLM_PROVIDER={name!r}. Implement it in agents/shared/providers/ "
        "and register it in make_provider()."
    )
