import asyncio

import pytest

from agents.shared import (
    AgentRequest,
    BaseAgent,
    MemoryService,
    MockEmbedding,
    MockLLM,
)
from agents.shared.qdrant_client import InMemoryQdrant


class _Agent(BaseAgent):
    name = "test"

    async def handle(self, req):  # not used in these tests
        raise NotImplementedError


@pytest.fixture
async def memory_service() -> MemoryService:
    s = MemoryService(qdrant=InMemoryQdrant(), embedder=MockEmbedding())
    await s.ensure_collections()
    return s


async def test_build_system_prompt_no_memory_returns_persona_unchanged() -> None:
    a = _Agent()
    a.memory = None
    persona = "you are a helpful agent"
    out = await a.build_system_prompt(
        AgentRequest(patient_id="p", message="hi"), persona
    )
    assert out == persona


async def test_build_system_prompt_empty_memory_returns_persona(memory_service) -> None:
    a = _Agent()
    a.memory = memory_service
    persona = "you are a helpful agent"
    out = await a.build_system_prompt(
        AgentRequest(patient_id="p", message="hi"), persona
    )
    assert out == persona


async def test_build_system_prompt_appends_context(memory_service) -> None:
    await memory_service.write_conversation_summary(
        "alice", summary="patient has asthma", agent="x", topics=["asthma"]
    )
    a = _Agent()
    a.memory = memory_service
    persona = "you are a helpful agent"
    out = await a.build_system_prompt(
        AgentRequest(patient_id="alice", message="how am i"), persona
    )
    assert out.startswith(persona)
    assert "Patient context" in out
    assert "asthma" in out


async def test_persist_turn_no_memory_is_noop() -> None:
    a = _Agent()
    a.memory = None
    # Should not raise. Should not require awaiting anything beyond the call.
    await a.persist_turn(AgentRequest(patient_id="p", message="x"), "y")


async def test_persist_turn_writes_summary_in_background(memory_service) -> None:
    a = _Agent()
    a.memory = memory_service
    a.provider = MockLLM()
    # Default summariser uses self.provider with the memory_summary prompt.
    # MockLLM echoes the user message — first line becomes the summary.
    await a.persist_turn(
        AgentRequest(patient_id="alice", message="I have a headache"),
        "Take rest and hydrate.",
    )
    # The persist runs in a background task; give it a tick to complete.
    for _ in range(20):
        await asyncio.sleep(0.01)
        bundle = await memory_service.retrieve_context("alice", "headache")
        if bundle.summary:
            break
    assert bundle.summary != ""


async def test_persist_turn_without_provider_uses_truncation(memory_service) -> None:
    a = _Agent()
    a.memory = memory_service
    a.provider = None
    long_reply = "x" * 1000
    await a.persist_turn(
        AgentRequest(patient_id="alice", message="hi"),
        long_reply,
    )
    for _ in range(20):
        await asyncio.sleep(0.01)
        bundle = await memory_service.retrieve_context("alice", "x")
        if bundle.summary:
            break
    # Fallback truncates to 240 chars; redaction passes it through unchanged.
    assert len(bundle.summary) <= 240
