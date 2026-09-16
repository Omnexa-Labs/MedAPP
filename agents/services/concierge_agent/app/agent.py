"""Concierge agent.

Wires together: system prompt + tool specs + executor + the chosen LLM provider
+ the patient memory layer (ADR 0003).

Per-turn flow:
  1. retrieve_context(patient_id, message) builds a ContextBundle
  2. ContextBundle is appended to the persona prompt
  3. LLMProvider.run() drives tools to satisfy the user's intent
  4. The (message, reply) pair is summarised and upserted to Qdrant in the
     background — `/chat` does not wait on this
"""
from __future__ import annotations

import asyncio

from agents.shared import (
    AgentRequest,
    AgentResponse,
    BaseAgent,
    LLMChatTurn,
    load_prompt,
    make_memory_service_from_env,
    make_provider,
)

from .config import settings
from .tools import TOOLS, make_executor

_SYSTEM_PROMPT = load_prompt("concierge.md")


class ConciergeAgent(BaseAgent):
    name = "concierge"

    def __init__(self) -> None:
        super().__init__()
        self.provider = make_provider(settings.llm_provider)
        self.memory = make_memory_service_from_env(
            ehr_service_url=settings.ehr_service_url
        )
        self.jwt_secret = settings.jwt_secret
        self.jwt_algorithm = settings.jwt_algorithm

    async def handle(self, req: AgentRequest) -> AgentResponse:
        system_prompt = await self.build_system_prompt(req, _SYSTEM_PROMPT)

        messages = [LLMChatTurn(role=t.role, content=t.content) for t in req.history]
        messages.append(LLMChatTurn(role="user", content=req.message))

        executor = make_executor(req.patient_id)

        def _run():
            return self.provider.run(
                system_prompt=system_prompt,
                messages=messages,
                tools=TOOLS,
                executor=executor,
                max_tokens=settings.max_tokens,
            )

        result = await asyncio.to_thread(_run)

        # Best-effort, fire-and-forget. /chat returns immediately.
        await self.persist_turn(req, result.reply)

        return AgentResponse(reply=result.reply, tool_calls=result.tool_calls, usage=result.usage)
