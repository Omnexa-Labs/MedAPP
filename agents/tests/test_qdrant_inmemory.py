import pytest

from agents.shared.qdrant_client import InMemoryQdrant, QdrantPoint


@pytest.fixture
def q() -> InMemoryQdrant:
    return InMemoryQdrant()


async def test_ensure_collection_is_idempotent(q: InMemoryQdrant) -> None:
    await q.ensure_collection("c1", vector_size=4)
    await q.ensure_collection("c1", vector_size=4)  # no-op
    # upsert into the collection works
    await q.upsert("c1", [QdrantPoint("p1", [1.0, 0.0, 0.0, 0.0], {"patient_id": "x"})])


async def test_search_filters_by_patient_id(q: InMemoryQdrant) -> None:
    await q.ensure_collection("c1", vector_size=2)
    await q.upsert(
        "c1",
        [
            QdrantPoint("a", [1.0, 0.0], {"patient_id": "alice"}),
            QdrantPoint("b", [1.0, 0.0], {"patient_id": "bob"}),
        ],
    )
    hits = await q.search("c1", vector=[1.0, 0.0], patient_id="alice", limit=10)
    assert [h.id for h in hits] == ["a"]


async def test_search_ranks_by_cosine(q: InMemoryQdrant) -> None:
    await q.ensure_collection("c1", vector_size=2)
    await q.upsert(
        "c1",
        [
            QdrantPoint("near", [1.0, 0.0], {"patient_id": "p"}),
            QdrantPoint("far", [0.0, 1.0], {"patient_id": "p"}),
        ],
    )
    hits = await q.search("c1", vector=[1.0, 0.0], patient_id="p", limit=2)
    assert [h.id for h in hits] == ["near", "far"]
    assert hits[0].score > hits[1].score


async def test_search_extra_filter_respected(q: InMemoryQdrant) -> None:
    await q.ensure_collection("c1", vector_size=2)
    await q.upsert(
        "c1",
        [
            QdrantPoint("a", [1.0, 0.0], {"patient_id": "p", "kind": "lifestyle"}),
            QdrantPoint("b", [1.0, 0.0], {"patient_id": "p", "kind": "medication"}),
        ],
    )
    hits = await q.search(
        "c1", vector=[1.0, 0.0], patient_id="p", limit=10,
        extra_filter={"kind": "medication"},
    )
    assert [h.id for h in hits] == ["b"]


async def test_upsert_replaces_same_id(q: InMemoryQdrant) -> None:
    await q.ensure_collection("c1", vector_size=2)
    await q.upsert("c1", [QdrantPoint("a", [1.0, 0.0], {"patient_id": "p", "v": 1})])
    await q.upsert("c1", [QdrantPoint("a", [0.0, 1.0], {"patient_id": "p", "v": 2})])
    hits = await q.search("c1", vector=[0.0, 1.0], patient_id="p", limit=10)
    assert len(hits) == 1
    assert hits[0].payload["v"] == 2


async def test_search_unknown_collection_returns_empty(q: InMemoryQdrant) -> None:
    hits = await q.search("nope", vector=[1.0], patient_id="p")
    assert hits == []
