from agents.shared.embeddings import MockEmbedding, make_embedder


def test_mock_embedding_is_deterministic() -> None:
    e = MockEmbedding()
    a = e.embed(["hello"])
    b = e.embed(["hello"])
    assert a == b


def test_mock_embedding_different_inputs_different_vectors() -> None:
    e = MockEmbedding()
    [v1] = e.embed(["hello"])
    [v2] = e.embed(["world"])
    assert v1 != v2


def test_mock_embedding_is_unit_normalized() -> None:
    e = MockEmbedding()
    [v] = e.embed(["the quick brown fox"])
    norm = sum(x * x for x in v) ** 0.5
    assert abs(norm - 1.0) < 1e-6


def test_mock_embedding_dim_matches_attribute() -> None:
    e = MockEmbedding()
    [v] = e.embed(["x"])
    assert len(v) == e.dim == 384


def test_make_embedder_unknown_raises() -> None:
    try:
        make_embedder("definitely-not-a-provider")
    except ValueError as exc:
        assert "Unknown" in str(exc)
    else:
        raise AssertionError("expected ValueError")


def test_make_embedder_mock_returns_mock() -> None:
    assert isinstance(make_embedder("mock"), MockEmbedding)
