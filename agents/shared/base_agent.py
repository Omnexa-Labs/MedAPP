"""Shared request/response shapes and a FastAPI factory for every agent.

Every agent exposes the same /chat contract so the mobile app, web admin, and
the concierge agent (calling sub-agents) all talk to them the same way.

`BaseAgent` provides two opt-in helpers for the patient-memory layer (ADR 0003):

- `build_system_prompt(req, persona_prompt)` — appends the patient
  `ContextBundle` to the persona prompt. Agents call this in place of the raw
  prompt string.
- `persist_turn(req, reply)` — fires a best-effort background write of a
  conversational summary. Agents call this after generating their reply.

Both no-op cleanly when `self.memory is None`, so an agent without memory
configured still works.

`make_app` wires JWT verification into `/chat` and exposes a reusable
auth dependency at `app.state.require_principal` for any extra routes
the service defines (e.g. smart_recommend's `/analyze`). The verified
`Principal` is used to derive `patient_id` — never trust the body.
"""
from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Any

from fastapi import Depends, FastAPI, HTTPException, status
from pydantic import BaseModel, Field

from .auth import Principal, make_require_principal, validate_jwt_secret

if TYPE_CHECKING:
    from .llm import LLMProvider
    from .memory import MemoryService

logger = logging.getLogger(__name__)


class ChatTurn(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class AgentRequest(BaseModel):
    # patient_id is intentionally Optional and **never trusted from the body
    # for patient-role tokens**. `make_app` overrides it with the verified
    # JWT subject before the request reaches `agent.handle()`. Admin-role
    # tokens may pass a patient_id to operate on someone else's record.
    patient_id: str | None = None
    message: str
    history: list[ChatTurn] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class AgentResponse(BaseModel):
    reply: str
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)
    usage: dict[str, int] = Field(default_factory=dict)


class BaseAgent:
    """Subclass and implement `handle()` to build an agent.

    Convention: subclasses set `self.provider`, `self.memory`, and
    `self.jwt_secret` in __init__. Provider and memory degrade gracefully
    when unset; jwt_secret is required for production and validated at
    `make_app` time.
    """

    name: str = "base"
    # When True, persist_turn uses self.provider + _memory_summary.md to
    # generate a compressed summary. When False, persist_turn stores a
    # truncated reply (cheaper, lower retrieval quality).
    enable_llm_memory_summary: bool = True

    def __init__(self) -> None:
        # Subclasses are expected to overwrite these. Typing as Any to avoid
        # forcing every subclass to declare them.
        self.provider: LLMProvider | None = None
        self.memory: MemoryService | None = None
        # JWT verification config. Subclasses set these from their pydantic
        # settings in __init__. Empty secret → /chat returns 503 outside
        # production and refuses to boot in production (see auth.validate_jwt_secret).
        self.jwt_secret: str = ""
        self.jwt_algorithm: str = "HS256"

    async def handle(self, req: AgentRequest) -> AgentResponse:
        raise NotImplementedError

    # ── Lifespan hooks ───────────────────────────────────────────────────────
    # Override in subclasses to manage background tasks (event subscribers,
    # schedulers, periodic flushes). `make_app` calls these inside the
    # FastAPI lifespan, after memory collections are ensured. Both no-op by
    # default so existing agents don't need to change.

    async def on_startup(self) -> None:
        return None

    async def on_shutdown(self) -> None:
        return None

    # ── Memory helpers ───────────────────────────────────────────────────────

    async def build_system_prompt(self, req: AgentRequest, persona_prompt: str) -> str:
        """Return the persona prompt with the patient ContextBundle appended.

        No-op if memory is not configured or returns nothing useful.
        """
        if self.memory is None:
            return persona_prompt
        try:
            bundle = await self.memory.retrieve_context(req.patient_id, req.message)
        except Exception:
            logger.exception("base_agent.retrieve_context_failed")
            return persona_prompt
        rendered = bundle.render()
        if not rendered:
            return persona_prompt
        return f"{persona_prompt}\n\n{rendered}"

    async def persist_turn(self, req: AgentRequest, reply: str) -> None:
        """Fire-and-forget background write of a conversational memory point.

        Returns immediately; the actual summarise+embed+upsert happens in a
        detached task. Failures are logged inside the task; the caller never
        sees them.
        """
        if self.memory is None or not reply:
            return
        asyncio.create_task(self._persist_turn_inner(req, reply))

    async def _persist_turn_inner(self, req: AgentRequest, reply: str) -> None:
        try:
            summary, topics = await self._summarize_turn(req.message, reply)
            await self.memory.write_conversation_summary(  # type: ignore[union-attr]
                req.patient_id,
                summary=summary,
                agent=self.name,
                topics=topics,
            )
        except Exception:
            logger.exception("base_agent.persist_turn_failed")

    async def _summarize_turn(self, user_msg: str, reply: str) -> tuple[str, list[str]]:
        """Default summariser. Uses self.provider + _memory_summary.md when
        available; otherwise falls back to a truncated reply.

        Override per-agent if you want a custom summarisation strategy.
        """
        if not (self.enable_llm_memory_summary and self.provider is not None):
            # Fallback: first 240 chars of the reply, no tags.
            return reply[:240], []

        prompt = _load_memory_summary_prompt()
        if prompt is None:
            return reply[:240], []

        from .llm import ChatTurn as LLMChatTurn

        messages = [
            LLMChatTurn(role="user", content=f"User: {user_msg}\n\nAssistant: {reply}")
        ]
        # No tools for the summariser.
        def _run():
            return self.provider.run(  # type: ignore[union-attr]
                system_prompt=prompt,
                messages=messages,
                tools=[],
                executor=lambda *_: "",
                max_tokens=200,
            )
        result = await asyncio.to_thread(_run)
        return _parse_summary_output(result.reply, fallback=reply[:240])


_MEMORY_SUMMARY_PROMPT: str | None = None


def _load_memory_summary_prompt() -> str | None:
    global _MEMORY_SUMMARY_PROMPT
    if _MEMORY_SUMMARY_PROMPT is not None:
        return _MEMORY_SUMMARY_PROMPT
    from pathlib import Path
    p = Path(__file__).resolve().parents[1] / "prompts" / "_memory_summary.md"
    try:
        _MEMORY_SUMMARY_PROMPT = p.read_text(encoding="utf-8")
    except OSError:
        logger.warning("base_agent.memory_prompt_missing path=%s", p)
        return None
    return _MEMORY_SUMMARY_PROMPT


def _parse_summary_output(raw: str, *, fallback: str) -> tuple[str, list[str]]:
    """Parse the two-line output described in `_memory_summary.md`.

    Line 1: summary paragraph. Line 2: JSON array of tags.
    Lenient: if parsing fails, return the fallback and an empty tag list.
    """
    if not raw or not raw.strip():
        return fallback, []
    lines = [ln for ln in raw.strip().splitlines() if ln.strip()]
    if not lines:
        return fallback, []
    summary = lines[0].strip()
    tags: list[str] = []
    if len(lines) >= 2:
        try:
            parsed = json.loads(lines[1])
            if isinstance(parsed, list):
                tags = [str(t)[:32] for t in parsed if isinstance(t, (str, int, float))][:6]
        except (json.JSONDecodeError, ValueError):
            pass
    return summary, tags


def make_app(agent: BaseAgent, *, service_name: str) -> FastAPI:
    # Fail-fast on unsafe secrets in production; warn otherwise.
    validate_jwt_secret(agent.jwt_secret, service_name=service_name)

    require_principal = make_require_principal(agent.jwt_secret, agent.jwt_algorithm)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if agent.memory is not None:
            try:
                await agent.memory.ensure_collections()
            except Exception:
                logger.exception("make_app.ensure_collections_failed")
        try:
            await agent.on_startup()
        except Exception:
            logger.exception("make_app.on_startup_failed")
        try:
            yield
        finally:
            try:
                await agent.on_shutdown()
            except Exception:
                logger.exception("make_app.on_shutdown_failed")

    app = FastAPI(title=f"MedApp Agent — {service_name}", version="0.1.0", lifespan=lifespan)
    # Expose the auth dependency so service-specific routes (e.g. smart_recommend
    # /analyze) can reuse it without rebuilding their own.
    app.state.require_principal = require_principal

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        # Healthz stays unauthenticated for container/k8s probes.
        return {"status": "ok", "service": service_name}

    @app.post("/chat", response_model=AgentResponse)
    async def chat(
        req: AgentRequest,
        principal: Principal = Depends(require_principal),
    ) -> AgentResponse:
        req.patient_id = enforce_patient_scope(
            requested=req.patient_id, principal=principal
        )
        return await agent.handle(req)

    return app


def enforce_patient_scope(*, requested: str | None, principal: Principal) -> str:
    """Resolve the effective patient_id for a request.

    Closes audit finding #4: the patient_id used for downstream lookups
    is always the verified JWT subject for patient-role tokens. Only
    admin tokens may operate on a different patient.

    Returns the resolved patient_id. Raises 403 if a non-admin token
    tries to act on someone else's record.
    """
    if principal.is_admin:
        # Admin tokens may operate on any patient. If they didn't specify,
        # default to their own subject (rare but harmless).
        return requested or principal.subject
    if requested and requested != principal.subject:
        logger.warning(
            "auth.cross_patient_attempt token_sub=%s requested=%s",
            principal.subject,
            requested,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="patient_id does not match token subject",
        )
    return principal.subject
