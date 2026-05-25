import pytest

from agents.shared.embeddings import MockEmbedding
from agents.shared.memory import (
    CONVERSATION_COLLECTION,
    RECOMMENDATION_COLLECTION,
    MemoryService,
)
from agents.shared.qdrant_client import InMemoryQdrant


@pytest.fixture
async def service() -> MemoryService:
    s = MemoryService(qdrant=InMemoryQdrant(), embedder=MockEmbedding())
    await s.ensure_collections()
    return s


async def test_round_trip_summary(service: MemoryService) -> None:
    await service.write_conversation_summary(
        "alice",
        summary="Patient reports headaches for three days, no fever.",
        agent="concierge",
        topics=["headache"],
    )
    bundle = await service.retrieve_context("alice", "my head hurts")
    assert "headache" in bundle.summary.lower() or "headaches" in bundle.summary.lower()
    assert "headache" in bundle.recent_topics


async def test_patient_id_isolation(service: MemoryService) -> None:
    await service.write_conversation_summary("alice", summary="alice symptoms", agent="x")
    await service.write_conversation_summary("bob", summary="bob symptoms", agent="x")
    bundle_a = await service.retrieve_context("alice", "symptoms")
    bundle_b = await service.retrieve_context("bob", "symptoms")
    assert "alice" in bundle_a.summary
    assert "bob" in bundle_b.summary
    assert "alice" not in bundle_b.summary
    assert "bob" not in bundle_a.summary


async def test_phi_is_redacted_before_storage(service: MemoryService) -> None:
    await service.write_conversation_summary(
        "alice",
        summary="Contact me at alice@example.com or +1 (555) 123-4567",
        agent="x",
    )
    bundle = await service.retrieve_context("alice", "contact")
    assert "alice@example.com" not in bundle.summary
    assert "555" not in bundle.summary
    assert "[email]" in bundle.summary
    assert "[phone]" in bundle.summary


async def test_empty_summary_does_not_write(service: MemoryService) -> None:
    await service.write_conversation_summary("alice", summary="   ", agent="x")
    bundle = await service.retrieve_context("alice", "anything")
    assert bundle.summary == ""


async def test_external_embedder_blocks_phi_write_by_default() -> None:
    s = MemoryService(
        qdrant=InMemoryQdrant(),
        embedder=MockEmbedding(),
        embedder_is_external=True,
        allow_external_phi_embedding=False,
    )
    await s.ensure_collections()
    await s.write_conversation_summary("alice", summary="anything", agent="x")
    bundle = await s.retrieve_context("alice", "anything")
    assert bundle.summary == ""


async def test_external_embedder_writes_when_allowed() -> None:
    s = MemoryService(
        qdrant=InMemoryQdrant(),
        embedder=MockEmbedding(),
        embedder_is_external=True,
        allow_external_phi_embedding=True,
    )
    await s.ensure_collections()
    await s.write_conversation_summary("alice", summary="patient reports cough", agent="x")
    bundle = await s.retrieve_context("alice", "cough")
    assert "cough" in bundle.summary


async def test_retrieve_returns_empty_bundle_without_ehr_or_memory() -> None:
    s = MemoryService(qdrant=InMemoryQdrant(), embedder=MockEmbedding())
    await s.ensure_collections()
    bundle = await s.retrieve_context("alice", "hello")
    assert bundle.summary == ""
    assert bundle.clinical_facts.active_conditions == []


async def test_context_bundle_render_is_empty_when_nothing_relevant() -> None:
    s = MemoryService(qdrant=InMemoryQdrant(), embedder=MockEmbedding())
    await s.ensure_collections()
    bundle = await s.retrieve_context("nobody", "hello")
    assert bundle.render() == ""


async def test_context_bundle_renders_clinical_facts() -> None:
    from agents.shared.memory import ClinicalFacts, ContextBundle

    bundle = ContextBundle(
        clinical_facts=ClinicalFacts(
            active_conditions=["asthma"],
            active_medications=["albuterol"],
            allergies=["penicillin"],
        ),
    )
    rendered = bundle.render()
    assert "asthma" in rendered
    assert "albuterol" in rendered
    assert "penicillin" in rendered
    assert rendered.startswith("## Patient context")


async def test_collections_are_created() -> None:
    q = InMemoryQdrant()
    s = MemoryService(qdrant=q, embedder=MockEmbedding())
    await s.ensure_collections()
    assert CONVERSATION_COLLECTION in q._collections
    assert RECOMMENDATION_COLLECTION in q._collections
