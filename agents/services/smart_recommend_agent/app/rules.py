"""Deterministic rule engine.

Each rule is a pure function: `(AnalysisContext) -> Signal | None`. Rules
make no I/O — the agent gathers context once via tools, then runs all
rules synchronously. This makes rules trivially testable and reproducible.

Per the vision doc, rules cover the "deterministic safety" layer:
- dangerous vitals
- medication conflicts (deferred — needs interaction data source)
- missed medications (deferred — needs adherence service)
- inactivity / no recent uploads
- overdue follow-ups
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from .signals import Signal


@dataclass(frozen=True)
class AnalysisContext:
    """Everything the engines need, gathered once per analysis run."""

    patient_id: str
    summary: dict[str, Any] = field(default_factory=dict)
    vitals: list[dict[str, Any]] = field(default_factory=list)
    now: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


# ── Thresholds ───────────────────────────────────────────────────────────────
# These are conservative, well-cited cut-offs. They are intentionally broad
# enough that hitting them warrants a clinician follow-up rather than a
# self-managed change.

_DANGEROUS_VITAL_RANGES = {
    # metric: (low_warn, high_warn, low_urgent, high_urgent), units assumed standard
    "systolic_bp":   (None, 140, None, 180),   # mmHg
    "diastolic_bp":  (None, 90,  None, 120),   # mmHg
    "fasting_glucose": (None, 125, 60, 250),   # mg/dL
    "resting_hr":    (40, 100, 35, 130),       # bpm
    "spo2":          (94, None, 90, None),     # %
}

# How long since the last vitals reading before we nudge the patient.
_NO_VITALS_WARN_DAYS = 30
_NO_VITALS_URGENT_DAYS = 90


def check_dangerous_vital(ctx: AnalysisContext) -> Signal | None:
    """Most-recent reading of any tracked metric outside the safe range."""
    last_vitals = ctx.summary.get("last_vitals") or {}
    if not last_vitals:
        return None

    for metric, value in last_vitals.items():
        if metric not in _DANGEROUS_VITAL_RANGES:
            continue
        if not isinstance(value, (int, float)):
            continue
        lo_w, hi_w, lo_u, hi_u = _DANGEROUS_VITAL_RANGES[metric]

        severity: str | None = None
        if (lo_u is not None and value < lo_u) or (hi_u is not None and value > hi_u):
            severity = "urgent"
        elif (lo_w is not None and value < lo_w) or (hi_w is not None and value > hi_w):
            severity = "warn"
        if severity is None:
            continue

        return Signal(
            source="rule.dangerous_vital",
            kind="followup",
            severity=severity,  # type: ignore[arg-type]
            title=f"Recent {_pretty(metric)} reading is outside the safe range",
            evidence=[f"latest {_pretty(metric)}: {value}"],
            suggested_action=(
                "Please discuss this with your doctor soon — within a few days "
                "if 'urgent', within a couple of weeks otherwise."
                if severity == "urgent"
                else "Please mention this at your next appointment, or sooner if it persists."
            ),
            dedup_key=f"dangerous_vital:{metric}",
        )
    return None


def check_no_recent_vitals(ctx: AnalysisContext) -> Signal | None:
    """Patient hasn't recorded any vital in a long while."""
    if not ctx.vitals:
        # Fully empty timeline is its own signal — flag it as 'warn' (not
        # urgent: maybe the patient is new and hasn't onboarded yet).
        return Signal(
            source="rule.no_recent_vitals",
            kind="wellness",
            severity="warn",
            title="No vitals recorded yet",
            evidence=["vitals timeline is empty"],
            suggested_action=(
                "Try recording one set of readings this week — blood pressure, "
                "weight, and a glucose reading if relevant — so we can spot "
                "trends as they develop."
            ),
            dedup_key="no_recent_vitals",
        )

    latest = _latest_vital_timestamp(ctx.vitals)
    if latest is None:
        return None

    age_days = (ctx.now - latest).days
    if age_days < _NO_VITALS_WARN_DAYS:
        return None

    severity: str = "urgent" if age_days >= _NO_VITALS_URGENT_DAYS else "warn"
    return Signal(
        source="rule.no_recent_vitals",
        kind="wellness",
        severity=severity,  # type: ignore[arg-type]
        title=f"No vitals recorded in the last {age_days} days",
        evidence=[f"last recorded vital: {latest.date().isoformat()}"],
        suggested_action=(
            "A quick check-in helps catch slow changes. Aim for at least one "
            "reading this week of whichever metric your doctor flagged."
        ),
        dedup_key="no_recent_vitals",
    )


def check_overdue_followup(ctx: AnalysisContext) -> Signal | None:
    """Recommend follow-up for chronic conditions with no recent vitals.

    Today this is just a heuristic: if the patient has any chronic condition
    AND the last vitals reading is > 90 days old, recommend a check-in. A
    proper implementation would consult the booking service for last visit.
    """
    conditions = ctx.summary.get("active_conditions") or []
    if not conditions:
        return None
    latest = _latest_vital_timestamp(ctx.vitals)
    if latest is None:
        return None
    if (ctx.now - latest).days < 90:
        return None
    return Signal(
        source="rule.overdue_followup",
        kind="followup",
        severity="warn",
        title="Time for a check-in given your condition history",
        evidence=[
            f"active condition: {', '.join(conditions[:3])}",
            f"last vital recorded: {latest.date().isoformat()}",
        ],
        suggested_action=(
            "Consider booking a routine appointment — even a telemedicine "
            "visit is fine — to review where things stand."
        ),
        dedup_key="overdue_followup",
    )


# Order matters only for tests and telemetry; the analyzer collects all
# non-None signals.
ALL_RULES = (
    check_dangerous_vital,
    check_no_recent_vitals,
    check_overdue_followup,
)


# ── Helpers ──────────────────────────────────────────────────────────────────


def _pretty(metric: str) -> str:
    return metric.replace("_", " ")


def _latest_vital_timestamp(vitals: list[dict[str, Any]]) -> datetime | None:
    latest: datetime | None = None
    for v in vitals:
        raw = v.get("recorded_at")
        if isinstance(raw, datetime):
            ts = raw
        elif isinstance(raw, str):
            try:
                ts = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            except ValueError:
                continue
        else:
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if latest is None or ts > latest:
            latest = ts
    return latest
