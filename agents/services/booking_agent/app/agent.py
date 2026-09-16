"""Booking agent.

Specialist booking sub-agent the Concierge delegates to when a multi-step
booking flow is needed. Same `make_app` shape as the other agents (auth
+ IDOR + memory) — what's distinctive is the persona prompt's emphasis
on confirming before irreversible actions (create / cancel).
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

_SYSTEM_PROMPT = load_prompt("booking.md")


class BookingAgent(BaseAgent):
    name = "booking"

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

        # make_app resolved patient_id against the JWT subject; trust it.
        assert req.patient_id is not None, "make_app must populate patient_id"
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
        await self.persist_turn(req, result.reply)

        return AgentResponse(
            reply=result.reply,
            tool_calls=result.tool_calls,
            usage=result.usage,
        )
