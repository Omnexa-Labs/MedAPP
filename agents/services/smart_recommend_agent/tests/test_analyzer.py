"""Analyzer — composes rules + patterns and dedups."""
from __future__ import annotations

from datetime import datetime, timezone

from app.analyzer import analyze
from app.rules import AnalysisContext
from app.signals import Signal


_NOW = datetime(2026, 5, 21, 12, 0, tzinfo=timezone.utc)


def test_empty_context_produces_signals_for_empty_state() -> None:
    """An entirely-empty context still surfaces 'no vitals' signal."""
    ctx = AnalysisContext(patient_id="p1", summary={}, vitals=[], now=_NOW)
    signals = analyze(ctx)
    # At minimum, the "no vitals" rule fires.
    assert any(s.source == "rule.no_recent_vitals" for s in signals)


def test_analyze_dedups_on_dedup_key_keeping_higher_severity() -> None:
    """If two engines emit the same dedup_key, only the higher severity survives."""
    from app.analyzer import _dedup  # noqa: PLC2701

    a = Signal(
        source="rule.dangerous_vital",
        kind="followup",
        severity="warn",
        title="x",
        dedup_key="same",
    )
    b = Signal(
        source="rule.dangerous_vital",
        kind="followup",
        severity="urgent",
        title="x",
        dedup_key="same",
    )
    out = _dedup([a, b])
    assert len(out) == 1
    assert out[0].severity == "urgent"


def test_analyze_keeps_signals_without_dedup_key() -> None:
    from app.analyzer import _dedup  # noqa: PLC2701

    a = Signal(source="rule.dangerous_vital", kind="followup", severity="warn", title="a")
    b = Signal(source="rule.dangerous_vital", kind="followup", severity="warn", title="b")
    out = _dedup([a, b])
    assert len(out) == 2
