"""ADR 0004 production guard: groq is blocked when ENV=production."""
import pytest

from agents.shared.llm import make_provider


def test_groq_blocked_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENV", "production")
    with pytest.raises(RuntimeError) as exc:
        make_provider("groq")
    assert "production" in str(exc.value).lower()


def test_mock_blocked_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENV", "production")
    with pytest.raises(RuntimeError):
        make_provider("mock")


def test_mock_allowed_outside_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ENV", raising=False)
    p = make_provider("mock")
    assert p is not None


def test_unknown_provider_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ENV", raising=False)
    with pytest.raises(ValueError):
        make_provider("not-a-real-provider")
