"""Pattern engine — trend detection over synthetic timeseries."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.patterns import TrendSpec, detect_all_trends, detect_trend
from app.rules import AnalysisContext


_NOW = datetime(2026, 5, 21, 12, 0, tzinfo=timezone.utc)


def _series(metric: str, values: list[float], *, start_days_ago: int = 90) -> list[dict]:
    n = len(values)
    if n == 0:
        return []
    step = max(1, start_days_ago // n)
    return [
        {
            "metric": metric,
            "value": v,
            "recorded_at": (_NOW - timedelta(days=start_days_ago - i * step)).isoformat(),
        }
        for i, v in enumerate(values)
    ]


def _ctx(vitals: list[dict]) -> AnalysisContext:
    return AnalysisContext(patient_id="p1", summary={}, vitals=vitals, now=_NOW)


def test_rising_trend_fires_on_clear_upward_drift() -> None:
    # First third averages ~95, last third averages ~115 → +21%
    series = _series("fasting_glucose", [92, 95, 98, 102, 108, 112, 115, 118, 120])
    spec = TrendSpec(metric="fasting_glucose", direction="rising")
    s = detect_trend(_ctx(series), spec)
    assert s is not None
    assert s.source == "pattern.rising_metric"
    assert "fasting_glucose" in s.evidence[0]


def test_rising_trend_silent_on_flat_series() -> None:
    series = _series("fasting_glucose", [95, 96, 94, 95, 97, 95, 96, 95, 96])
    spec = TrendSpec(metric="fasting_glucose", direction="rising")
    assert detect_trend(_ctx(series), spec) is None


def test_declining_trend_fires_on_clear_downward_drift() -> None:
    series = _series("weight_kg", [80, 79, 78, 76, 74, 72, 70, 69, 68])
    spec = TrendSpec(metric="weight_kg", direction="declining")
    s = detect_trend(_ctx(series), spec)
    assert s is not None
    assert s.source == "pattern.declining_metric"


def test_trend_silent_with_too_few_points() -> None:
    series = _series("fasting_glucose", [95, 110])  # only 2 points
    spec = TrendSpec(metric="fasting_glucose", direction="rising", min_points=3)
    assert detect_trend(_ctx(series), spec) is None


def test_trend_silent_when_window_excludes_old_data() -> None:
    # All points older than the 90-day window.
    series = _series(
        "fasting_glucose",
        [95, 100, 110, 120, 130],
        start_days_ago=200,
    )
    spec = TrendSpec(metric="fasting_glucose", direction="rising", window_days=90)
    assert detect_trend(_ctx(series), spec) is None


def test_detect_all_trends_runs_each_registered_spec() -> None:
    series = (
        _series("fasting_glucose", [92, 95, 98, 105, 110, 114, 117, 120, 124])
        + _series("systolic_bp", [118, 119, 120, 122, 125, 130, 135, 138, 140])
    )
    out = detect_all_trends(_ctx(series))
    sources = {s.source for s in out}
    # Both rising-trend specs should fire.
    assert "pattern.rising_metric" in sources
    assert len(out) >= 2
