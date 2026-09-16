"""Lab Reader agent.

Two execution paths:

  /scan (synchronous vision call, no LLM tool-calling):
      Input: a single base64-encoded image + media type.
      Pipeline:
        1. Validate input (size, media type, decode).
        2. Run the extraction LLM with the image attached and the strict
           JSON schema prompt.
        3. Parse + normalise the LLM output into a `ScanResult`.
        4. Return the structured result.
      Never raises on bad input — returns a low-confidence empty result
      with descriptive warnings.

  /chat:
      Standard ChatTurn flow. Used for follow-up questions about a
      previously scanned result ("what does my hemoglobin mean?"). The
      LLM may call `get_ehr_summary` to ground its answer.
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

from .config import settings
from .scan import scan_image as _scan_image
from .tools import TOOLS, make_executor

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = load_prompt("lab_reader.md")


class LabReaderAgent(BaseAgent):
    name = "lab_reader"

    def __init__(self) -> None:
        super().__init__()
        self.provider = make_provider(settings.llm_provider)
        self.memory = make_memory_service_from_env(
            ehr_service_url=settings.ehr_service_url
        )
        self.jwt_secret = settings.jwt_secret
        self.jwt_algorithm = settings.jwt_algorithm

    # ── /scan path ───────────────────────────────────────────────────────────

    async def scan(
        self,
        *,
        image_bytes: bytes,
        media_type: str,
        doc_type_hint: str | None = None,
    ):
        """Vision extraction. Returns a `ScanResult` (never raises)."""
        return await _scan_image(
            self.provider,
            image_bytes=image_bytes,
            media_type=media_type,
            doc_type_hint=doc_type_hint,
            max_tokens=settings.scan_max_tokens,
        )

    # ── /chat path ───────────────────────────────────────────────────────────

    async def handle(self, req: AgentRequest) -> AgentResponse:
        system_prompt = await self.build_system_prompt(req, _SYSTEM_PROMPT)

        messages = [LLMChatTurn(role=t.role, content=t.content) for t in req.history]
        messages.append(LLMChatTurn(role="user", content=req.message))

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
