"""Concierge agent — the patient's main entry point.

Implementation notes:
- Model: claude-opus-4-7 (per `claude-api` skill default).
- Adaptive thinking on (the only on-mode for Opus 4.7).
- Effort `high` (recommended for intelligence-sensitive work).
- System prompt is frozen and marked `cache_control: ephemeral` — the prefix is
  tools (deterministic order) → system → messages. The patient's per-request
  message goes after the breakpoint so the cache hits across turns.
- We use the SDK's beta tool runner so we don't hand-roll the agentic loop.
"""
from __future__ import annotations

import asyncio
from pathlib import Path

from agents.shared import AgentRequest, AgentResponse, BaseAgent, get_claude_client

from .config import settings
from .tools import ALL_TOOLS

_SYSTEM_PROMPT = (Path(__file__).resolve().parents[3] / "prompts" / "concierge.md").read_text()


class ConciergeAgent(BaseAgent):
    name = "concierge"

    async def handle(self, req: AgentRequest) -> AgentResponse:
        client = get_claude_client()

        history_messages = [{"role": t.role, "content": t.content} for t in req.history]
        user_turn = {
            "role": "user",
            "content": (
                f"[patient_id={req.patient_id}]\n{req.message}"
            ),
        }

        def _run():
            runner = client.beta.messages.tool_runner(
                model=settings.model,
                max_tokens=settings.max_tokens,
                thinking={"type": "adaptive"},
                output_config={"effort": settings.effort},
                system=[
                    {
                        "type": "text",
                        "text": _SYSTEM_PROMPT,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                tools=ALL_TOOLS,
                messages=[*history_messages, user_turn],
            )
            final = None
            tool_calls: list[dict] = []
            for message in runner:
                final = message
                for block in message.content:
                    if block.type == "tool_use":
                        tool_calls.append({"name": block.name, "input": block.input})
            return final, tool_calls

        final, tool_calls = await asyncio.to_thread(_run)

        reply = next((b.text for b in final.content if b.type == "text"), "")
        usage = {
            "input_tokens": final.usage.input_tokens,
            "output_tokens": final.usage.output_tokens,
            "cache_read_input_tokens": getattr(final.usage, "cache_read_input_tokens", 0) or 0,
            "cache_creation_input_tokens": getattr(final.usage, "cache_creation_input_tokens", 0) or 0,
        }
        return AgentResponse(reply=reply, tool_calls=tool_calls, usage=usage)
