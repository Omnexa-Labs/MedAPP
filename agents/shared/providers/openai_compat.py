"""Shared base for providers that speak the OpenAI chat-completions wire format.

Covers OpenAI itself, Groq, and any future Together/Fireworks/vLLM endpoint
(they all expose `/v1/chat/completions` with `tools=` for function calling).
A subclass picks the base URL, the env var name for the key, and the default
model. Everything else is shared.

Tool-call loop: we run *one* completion at a time. If the model returns
tool_calls, we execute each via the supplied executor and feed the results
back as `role=tool` messages, then call the model again. We cap at
`max_tool_iterations` to avoid runaway loops.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any

import base64

from ..llm import ChatTurn, ImagePart, LLMResult, ToolExecutor, ToolSpec

logger = logging.getLogger(__name__)


class OpenAICompatProvider:
    """Subclass and override the four class-level attributes."""

    # Subclasses must set these:
    env_key_var: str = ""           # e.g. "OPENAI_API_KEY"
    default_base_url: str | None = None  # None → SDK default
    default_model: str = ""

    # Safety: cap on tool-call iterations per turn.
    max_tool_iterations: int = 8

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
    ) -> None:
        try:
            from openai import OpenAI
        except ImportError as e:
            raise ImportError(
                f"{type(self).__name__} requires the `openai` package. "
                "Install via `agents[openai]` or `agents[groq]`."
            ) from e
        key = api_key or os.getenv(self.env_key_var)
        if not key:
            raise RuntimeError(
                f"{type(self).__name__}: env var {self.env_key_var} is not set."
            )
        self._model = model or os.getenv(self._model_env_var(), self.default_model)
        self._client = OpenAI(
            api_key=key,
            base_url=base_url or self.default_base_url,
        )

    @classmethod
    def _model_env_var(cls) -> str:
        # OPENAI_MODEL / GROQ_MODEL — convention based on env_key_var prefix.
        prefix = cls.env_key_var.split("_API_KEY")[0]
        return f"{prefix}_MODEL"

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
        wire_messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_prompt}
        ]
        wire_messages.extend({"role": m.role, "content": m.content} for m in messages)
        if images:
            # Attach images to the most recent user message. OpenAI's
            # multimodal format wraps content as a list of typed parts.
            _attach_images_to_last_user(wire_messages, images)
        wire_tools = [_tool_to_openai(t) for t in tools] if tools else None

        all_tool_calls: list[dict[str, Any]] = []
        usage_in = 0
        usage_out = 0
        final_reply = ""

        for iteration in range(self.max_tool_iterations):
            kwargs: dict[str, Any] = {
                "model": self._model,
                "messages": wire_messages,
                "max_tokens": max_tokens,
            }
            if wire_tools:
                kwargs["tools"] = wire_tools
                kwargs["tool_choice"] = "auto"

            resp = self._client.chat.completions.create(**kwargs)
            choice = resp.choices[0]
            msg = choice.message
            if getattr(resp, "usage", None):
                usage_in += getattr(resp.usage, "prompt_tokens", 0) or 0
                usage_out += getattr(resp.usage, "completion_tokens", 0) or 0

            tool_calls = getattr(msg, "tool_calls", None) or []
            if not tool_calls:
                final_reply = msg.content or ""
                break

            # Record the assistant turn that requested tools (must include them).
            wire_messages.append(
                {
                    "role": "assistant",
                    "content": msg.content,
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            },
                        }
                        for tc in tool_calls
                    ],
                }
            )

            for tc in tool_calls:
                name = tc.function.name
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                all_tool_calls.append({"name": name, "input": args})
                try:
                    result = executor(name, args)
                except Exception as e:
                    logger.exception("tool_executor_failed name=%s", name)
                    result = json.dumps({"error": str(e)})
                wire_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result,
                    }
                )
        else:
            # Loop exhausted without a non-tool reply.
            logger.warning(
                "llm.tool_loop_exhausted iterations=%s model=%s",
                self.max_tool_iterations,
                self._model,
            )
            final_reply = (
                "I ran out of steps before finishing that — could you rephrase or break it up?"
            )

        return LLMResult(
            reply=final_reply,
            tool_calls=all_tool_calls,
            usage={"input_tokens": usage_in, "output_tokens": usage_out},
        )


def _tool_to_openai(spec: ToolSpec) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": spec.name,
            "description": spec.description,
            "parameters": spec.input_schema,
        },
    }


def _attach_images_to_last_user(
    wire_messages: list[dict[str, Any]], images: list[ImagePart]
) -> None:
    """Convert the most recent user message's content into OpenAI's multimodal
    list form, then append each image as an `image_url` part.

    If no user message exists yet (rare — the caller should have added one),
    a new user turn is created carrying only the images.
    """
    for msg in reversed(wire_messages):
        if msg.get("role") == "user":
            text = msg.get("content", "")
            parts: list[dict[str, Any]] = []
            if isinstance(text, str) and text:
                parts.append({"type": "text", "text": text})
            elif isinstance(text, list):
                parts.extend(text)
            for img in images:
                parts.append(_image_to_part(img))
            msg["content"] = parts
            return
    # No user message — synthesise one.
    wire_messages.append(
        {"role": "user", "content": [_image_to_part(img) for img in images]}
    )


def _image_to_part(img: ImagePart) -> dict[str, Any]:
    b64 = base64.b64encode(img.data).decode("ascii")
    return {
        "type": "image_url",
        "image_url": {
            "url": f"data:{img.media_type};base64,{b64}",
            "detail": img.detail,
        },
    }
