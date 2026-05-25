"""Pattern detection engine.

Pattern detectors look at *timeseries* and find slow drifts — the things a
single reading wouldn't catch. They are pure functions of an
`AnalysisContext` (same shape as rules), produce a `Signal | None`, and do
no I/O.

This first slice ships two generic detectors:

- rising-trend  → metric has drifted up by >= X% over a window
- declining-trend → mirror of above

They are parameterised per metric so adding "rising fasting glucose" vs
"rising systolic BP" is a one-line registration, not a new detector.
"""
from __future__ import annotations

import statistics
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, Literal

from .rules import AnalysisContext, _latest_vital_timestamp  # noqa: PLC2701
from .signals import RecommendationKind, Severity, Signal


@dataclass(frozen=True)
class TrendSpec:
    """How to detect a meaningful drift on one metric."""

    metric: str
    direction: Literal["rising", "declining"]
    window_days: int = 90
    min_points: int = 3
    # Fractional change over the window that we consider meaningful.
    # 0.10 = 10% drift end-to-start, judged via the first/last thirds.
    threshold_fraction: float = 0.10
    # When fired, what kind/severity to attach to the resulting Signal.
    kind: RecommendationKind = "lifestyle"
    severity: Severity = "warn"
    title_template: str = ""
    action: str = ""


# Default set. Add new metrics here; the engine adapts automatically.
TREND_SPECS: tuple[TrendSpec, ...] = (
    TrendSpec(
        metric="fasting_glucose",
        direction="rising",
        kind="followup",
        severity="warn",
        title_template="Fasting glucose has been creeping up",
        action=(
            "It's worth flagging this trend with your doctor — small early "
            "lifestyle changes are usually easier than waiting until it's "
            "higher."
        ),
    ),
    TrendSpec(
        metric="systolic_bp",
        direction="rising",
        kind="followup",
        severity="warn",
        title_template="Systolic blood pressure has been trending up",
        action=(
            "Bring this up at your next visit. If readings stay high for "
            "more than two weeks, book sooner."
        ),
    ),
    TrendSpec(
        metric="weight_kg",
        direction="declining",
        kind="wellness",
        severity="info",
        title_template="Steady weight loss over the last few months",
        action=(
            "If this isn't intentional, mention it to your doctor — "
            "unintended weight loss can be worth checking out."
        ),
    ),
)


def detect_trend(ctx: AnalysisContext, spec: TrendSpec) -> Signal | None:
    """Single-spec detector. The engine driver runs this for each spec."""
    points = _points_for(ctx, spec.metric, spec.window_days)
    if len(points) < spec.min_points:
        return None

    # Compare the mean of the first third and the last third — robust to
    # one-off outliers without needing a full regression.
    cut = max(1, len(points) // 3)
    first = statistics.mean(p[1] for p in points[:cut])
    last = statistics.mean(p[1] for p in points[-cut:])
    if first == 0:
        return None

    delta = (last - first) / abs(first)
    if spec.direction == "rising" and delta < spec.threshold_fraction:
        return None
    if spec.direction == "declining" and delta > -spec.threshold_fraction:
        return None

    pct = round(delta * 100)
    return Signal(
        source="pattern.rising_metric" if spec.direction == "rising" else "pattern.declining_metric",
        kind=spec.kind,
        severity=spec.severity,
        title=spec.title_template or f"{spec.metric} {spec.direction}",
        evidence=[
            f"{spec.metric}: {round(first, 1)} → {round(last, 1)} "
            f"({pct:+d}% over ~{spec.window_days} days, n={len(points)})"
        ],
        suggested_action=spec.action,
        dedup_key=f"{spec.direction}:{spec.metric}",
    )


def detect_all_trends(ctx: AnalysisContext) -> list[Signal]:
    """Convenience: run every registered spec, drop Nones."""
    out: list[Signal] = []
    for spec in TREND_SPECS:
        s = detect_trend(ctx, spec)
        if s is not None:
            out.append(s)
    return out


# ── Helpers ──────────────────────────────────────────────────────────────────


def _points_for(
    ctx: AnalysisContext, metric: str, window_days: int
) -> list[tuple[Any, float]]:
    """Return (timestamp, value) pairs for a metric within the window, sorted oldest→newest."""
    cutoff = ctx.now - timedelta(days=window_days)
    out: list[tuple[Any, float]] = []
    for v in ctx.vitals:
        if v.get("metric") != metric:
            continue
        ts_raw = v.get("recorded_at")
        ts = _to_dt(ts_raw)
        if ts is None or ts < cutoff:
            continue
        val = v.get("value")
        if not isinstance(val, (int, float)):
            continue
        out.append((ts, float(val)))
    out.sort(key=lambda x: x[0])
    return out


def _to_dt(raw: Any):
    from datetime import datetime, timezone

    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    if isinstance(raw, str):
        try:
            ts = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


# Silence the noqa above — re-export so tests don't need to dig into rules.py
__all__ = [
    "TREND_SPECS",
    "TrendSpec",
    "detect_all_trends",
    "detect_trend",
    "_latest_vital_timestamp",
]
