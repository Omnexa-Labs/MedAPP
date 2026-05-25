"""Rule engine — deterministic checks. No I/O, no LLM."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.rules import (
    AnalysisContext,
    check_dangerous_vital,
    check_no_recent_vitals,
    check_overdue_followup,
)


_NOW = datetime(2026, 5, 21, 12, 0, tzinfo=timezone.utc)


def _ctx(**kwargs) -> AnalysisContext:
    defaults = {"patient_id": "p1", "summary": {}, "vitals": [], "now": _NOW}
    defaults.update(kwargs)
    return AnalysisContext(**defaults)


# ── check_dangerous_vital ─────────────────────────────────────────────────────


def test_dangerous_vital_warn_on_high_bp() -> None:
    ctx = _ctx(summary={"last_vitals": {"systolic_bp": 150}})
    s = check_dangerous_vital(ctx)
    assert s is not None
    assert s.severity == "warn"
    assert s.kind == "followup"
    assert "systolic bp" in s.title.lower()


def test_dangerous_vital_urgent_on_very_high_bp() -> None:
    ctx = _ctx(summary={"last_vitals": {"systolic_bp": 200}})
    s = check_dangerous_vital(ctx)
    assert s is not None
    assert s.severity == "urgent"


def test_dangerous_vital_urgent_on_low_spo2() -> None:
    ctx = _ctx(summary={"last_vitals": {"spo2": 88}})
    s = check_dangerous_vital(ctx)
    assert s is not None
    assert s.severity == "urgent"


def test_dangerous_vital_silent_on_normal_readings() -> None:
    ctx = _ctx(summary={"last_vitals": {"systolic_bp": 120, "diastolic_bp": 78}})
    assert check_dangerous_vital(ctx) is None


def test_dangerous_vital_silent_on_no_data() -> None:
    assert check_dangerous_vital(_ctx()) is None


# ── check_no_recent_vitals ────────────────────────────────────────────────────


def test_no_recent_vitals_warn_on_empty_timeline() -> None:
    s = check_no_recent_vitals(_ctx())
    assert s is not None
    assert s.severity == "warn"
    assert "empty" in (s.evidence[0] if s.evidence else "").lower()


def test_no_recent_vitals_warn_at_30_days() -> None:
    last = (_NOW - timedelta(days=45)).isoformat()
    ctx = _ctx(vitals=[{"recorded_at": last, "metric": "systolic_bp", "value": 120}])
    s = check_no_recent_vitals(ctx)
    assert s is not None
    assert s.severity == "warn"


def test_no_recent_vitals_urgent_at_90_days() -> None:
    last = (_NOW - timedelta(days=120)).isoformat()
    ctx = _ctx(vitals=[{"recorded_at": last, "metric": "systolic_bp", "value": 120}])
    s = check_no_recent_vitals(ctx)
    assert s is not None
    assert s.severity == "urgent"


def test_no_recent_vitals_silent_when_recent() -> None:
    last = (_NOW - timedelta(days=5)).isoformat()
    ctx = _ctx(vitals=[{"recorded_at": last, "metric": "systolic_bp", "value": 120}])
    assert check_no_recent_vitals(ctx) is None


# ── check_overdue_followup ────────────────────────────────────────────────────


def test_overdue_followup_silent_without_conditions() -> None:
    last = (_NOW - timedelta(days=120)).isoformat()
    ctx = _ctx(
        summary={"active_conditions": []},
        vitals=[{"recorded_at": last, "metric": "systolic_bp", "value": 120}],
    )
    assert check_overdue_followup(ctx) is None


def test_overdue_followup_fires_with_chronic_condition_and_stale_vitals() -> None:
    last = (_NOW - timedelta(days=120)).isoformat()
    ctx = _ctx(
        summary={"active_conditions": ["hypertension"]},
        vitals=[{"recorded_at": last, "metric": "systolic_bp", "value": 120}],
    )
    s = check_overdue_followup(ctx)
    assert s is not None
    assert s.kind == "followup"
    assert "hypertension" in " ".join(s.evidence)


def test_overdue_followup_silent_with_recent_vitals() -> None:
    last = (_NOW - timedelta(days=10)).isoformat()
    ctx = _ctx(
        summary={"active_conditions": ["hypertension"]},
        vitals=[{"recorded_at": last, "metric": "systolic_bp", "value": 120}],
    )
    assert check_overdue_followup(ctx) is None
