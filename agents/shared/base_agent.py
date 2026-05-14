"""Shared request/response shapes and a FastAPI factory for every agent.

Every agent exposes the same /chat contract so the mobile app, web admin, and
the concierge agent (calling sub-agents) all talk to them the same way.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field


class ChatTurn(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class AgentRequest(BaseModel):
    patient_id: str
    message: str
    history: list[ChatTurn] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class AgentResponse(BaseModel):
    reply: str
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)
    usage: dict[str, int] = Field(default_factory=dict)


class BaseAgent:
    """Subclass and implement `handle()` to build an agent."""

    name: str = "base"

    async def handle(self, req: AgentRequest) -> AgentResponse:
        raise NotImplementedError


def make_app(agent: BaseAgent, *, service_name: str) -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI):
        yield

    app = FastAPI(title=f"MedApp Agent — {service_name}", version="0.1.0", lifespan=lifespan)

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "service": service_name}

    @app.post("/chat", response_model=AgentResponse)
    async def chat(req: AgentRequest) -> AgentResponse:
        return await agent.handle(req)

    return app
