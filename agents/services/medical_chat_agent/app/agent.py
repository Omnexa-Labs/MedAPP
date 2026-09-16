"""Medical Chat agent.

Per-turn flow:

  1. Deterministic emergency triage (shared/triage.py). If any of the seven
     vision-doc emergency categories fires on the user's message, the agent
     returns a canned emergency reply *without ever invoking the LLM*. The
     turn is still persisted to memory with an `emergency: true` topic so
     downstream agents (recommendation, concierge) know what happened.
  2. Otherwise: build the system prompt with patient memory context, run
     the LLM with the registered tools, persist the turn, return.
"""
from __future__ import annotations

import asyncio
import logging

from agents.shared import (
    AgentRequest,
    AgentResponse,
    BaseAgent,
    LLMChatTurn,
    load_prompt,
    make_memory_service_from_env,
    make_provider,
)
from agents.shared.triage import TriageResult, classify

from .config import settings
from .tools import TOOLS, make_executor

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = load_prompt("medical_chat.md")


class MedicalChatAgent(BaseAgent):
    name = "medical_chat"

    def __init__(self) -> None:
        super().__init__()
        self.provider = make_provider(settings.llm_provider)
        self.memory = make_memory_service_from_env(
            ehr_service_url=settings.ehr_service_url
        )
        self.jwt_secret = settings.jwt_secret
        self.jwt_algorithm = settings.jwt_algorithm

    async def handle(self, req: AgentRequest) -> AgentResponse:
        # Deterministic safety floor — runs before the LLM, every time.
        triage = classify(req.message)
        if triage.level == "emergency":
            return await self._handle_emergency(req, triage)

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
        await self.persist_turn(req, result.reply)

        return AgentResponse(
            reply=result.reply,
            tool_calls=result.tool_calls,
            usage=result.usage,
        )

    async def _handle_emergency(
        self, req: AgentRequest, triage: TriageResult
    ) -> AgentResponse:
        logger.warning(
            "medical_chat.emergency_triggered patient=%s category=%s matched=%r",
            req.patient_id,
            triage.category,
            triage.matched,
        )
        reply = triage.recommended_reply or (
            "This sounds like a possible medical emergency. Please call your "
            "local emergency number immediately."
        )

        # Persist with an emergency topic so future agents can see this happened.
        if self.memory is not None:
            asyncio.create_task(
                self.memory.write_conversation_summary(
                    req.patient_id,
                    summary=(
                        f"Emergency triage triggered ({triage.category}). "
                        f"Patient was advised to call emergency services."
                    ),
                    agent=self.name,
                    topics=["emergency", triage.category or "unknown"],
                )
            )

        return AgentResponse(
            reply=reply,
            tool_calls=[],
            usage={"input_tokens": 0, "output_tokens": 0},
        )
