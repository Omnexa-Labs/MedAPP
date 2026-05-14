from __future__ import annotations

import asyncio
from pathlib import Path

from agents.shared import (
    AgentRequest,
    AgentResponse,
    BaseAgent,
    LLMChatTurn,
    make_provider,
)

from .config import settings
from .tools import TOOLS, make_executor

_SYSTEM_PROMPT = (Path(__file__).resolve().parents[3] / "prompts" / "lab_reader.md").read_text()


class LabReaderAgent(BaseAgent):
    name = "lab_reader"

    def __init__(self) -> None:
        self._provider = make_provider(settings.llm_provider)

    async def handle(self, req: AgentRequest) -> AgentResponse:
        messages = [LLMChatTurn(role=t.role, content=t.content) for t in req.history]
        messages.append(LLMChatTurn(role="user", content=req.message))
        executor = make_executor(req.patient_id)

        def _run():
            return self._provider.run(
                system_prompt=_SYSTEM_PROMPT,
                messages=messages,
                tools=TOOLS,
                executor=executor,
                max_tokens=settings.max_tokens,
            )

        result = await asyncio.to_thread(_run)
        return AgentResponse(reply=result.reply, tool_calls=result.tool_calls, usage=result.usage)
