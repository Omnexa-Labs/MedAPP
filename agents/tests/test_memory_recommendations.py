"""Tests for MemoryService.write_recommendation + list_open_recommendations.

Mirrors the conversation_memory round-trip tests but for the recommendation
collection. Uses InMemoryQdrant + MockEmbedding — no live deps.
"""
from __future__ import annotations

import pytest

from agents.shared.embeddings import MockEmbedding
from agents.shared.memory import MemoryService
from agents.shared.qdrant_client import InMemoryQdrant


@pytest.fixture
async def service() -> MemoryService:
    s = MemoryService(qdrant=InMemoryQdrant(), embedder=MockEmbedding())
    await s.ensure_collections()
    return s


async def test_write_and_list(service: MemoryService) -> None:
    await service.write_recommendation(
        "alice",
        text="Your fasting glucose has been creeping up — worth flagging at your next visit.",
        kind="followup",
        source_agent="smart_recommend",
        evidence=["fasting_glucose: 92 → 115 (+25%)"],
        dedup_key="rising:fasting_glucose",
    )
    recs = await service.list_open_recommendations("alice")
    assert len(recs) == 1
    assert recs[0].kind == "followup"
    assert recs[0].status == "proposed"
    assert "glucose" in recs[0].text.lower()


async def test_dedup_key_overwrites_existing(service: MemoryService) -> None:
    """Two writes with the same dedup_key should yield one stored point.

    This is the safeguard against spamming the patient with the same nudge
    on every analysis run.
    """
    for text in ["initial wording", "second wording — slightly different"]:
        await service.write_recommendation(
            "alice",
            text=text,
            kind="followup",
            source_agent="smart_recommend",
            dedup_key="rising:fasting_glucose",
        )
    recs = await service.list_open_recommendations("alice")
    assert len(recs) == 1
    assert recs[0].text == "second wording — slightly different"


async def test_list_isolates_per_patient(service: MemoryService) -> None:
    await service.write_recommendation(
        "alice", text="for alice", kind="wellness", source_agent="x", dedup_key="a"
    )
    await service.write_recommendation(
        "bob", text="for bob", kind="wellness", source_agent="x", dedup_key="b"
    )
    alice = await service.list_open_recommendations("alice")
    bob = await service.list_open_recommendations("bob")
    assert [r.text for r in alice] == ["for alice"]
    assert [r.text for r in bob] == ["for bob"]


async def test_empty_text_does_not_write(service: MemoryService) -> None:
    await service.write_recommendation(
        "alice", text="   ", kind="wellness", source_agent="x", dedup_key="empty"
    )
    recs = await service.list_open_recommendations("alice")
    assert recs == []


async def test_external_embedder_blocks_writes_by_default() -> None:
    s = MemoryService(
        qdrant=InMemoryQdrant(),
        embedder=MockEmbedding(),
        embedder_is_external=True,
        allow_external_phi_embedding=False,
    )
    await s.ensure_collections()
    await s.write_recommendation(
        "alice", text="anything", kind="wellness", source_agent="x"
    )
    recs = await s.list_open_recommendations("alice")
    assert recs == []
