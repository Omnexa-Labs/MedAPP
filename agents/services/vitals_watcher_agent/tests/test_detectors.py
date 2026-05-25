"""Detector unit tests — single-sample anomaly classification.

False negatives are far more dangerous than false positives in the acute
lane, so the cases below over-cover the boundary conditions.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.detectors import (
    VitalReading,
    detect_all,
    detect_anomaly,
    parse_reading,
)


def _r(metric: str, value: float, unit: str | None = None) -> VitalReading:
    return VitalReading(
        metric=metric,
        value=value,
        unit=unit,
        recorded_at=datetime(2026, 5, 21, 12, 0, tzinfo=timezone.utc),
    )


# ── Heart rate ──────────────────────────────────────────────────────────────


def test_resting_heart_rate_in_range_is_silent() -> None:
    assert detect_anomaly(_r("heart_rate", 72)) is None


def test_heart_rate_just_above_warning_fires_warning() -> None:
    a = detect_anomaly(_r("heart_rate", 131))
    assert a is not None
    assert a.severity == "warning"


def test_heart_rate_above_critical_fires_critical() -> None:
    a = detect_anomaly(_r("heart_rate", 185))
    assert a is not None
    assert a.severity == "critical"


def test_low_heart_rate_below_critical_fires_critical() -> None:
    a = detect_anomaly(_r("heart_rate", 30))
    assert a is not None
    assert a.severity == "critical"
    assert "critically low" in a.rationale


def test_low_heart_rate_in_warning_band_fires_warning() -> None:
    # 37 is between low_critical (35) and low_warning (40).
    a = detect_anomaly(_r("heart_rate", 37))
    assert a is not None
    assert a.severity == "warning"


# ── SpO2 ────────────────────────────────────────────────────────────────────


def test_spo2_normal_is_silent() -> None:
    assert detect_anomaly(_r("spo2", 98)) is None


def test_spo2_warning_band_fires_warning() -> None:
    a = detect_anomaly(_r("spo2", 90))
    assert a is not None
    assert a.severity == "warning"


def test_spo2_below_88_is_critical() -> None:
    a = detect_anomaly(_r("spo2", 85))
    assert a is not None
    assert a.severity == "critical"


def test_spo2_at_boundary_88_is_critical() -> None:
    """Boundary check: < 88 critical. 88.0 should NOT fire critical."""
    a = detect_anomaly(_r("spo2", 88.0))
    # 88 is in the warning band (>= 88 and < 92).
    assert a is not None
    assert a.severity == "warning"


# ── Blood pressure ──────────────────────────────────────────────────────────


def test_systolic_bp_normal_is_silent() -> None:
    assert detect_anomaly(_r("systolic_bp", 120)) is None


def test_systolic_bp_warning_fires() -> None:
    a = detect_anomaly(_r("systolic_bp", 185))
    assert a is not None
    assert a.severity == "warning"


def test_systolic_bp_critical_fires() -> None:
    a = detect_anomaly(_r("systolic_bp", 210))
    assert a is not None
    assert a.severity == "critical"


# ── Unknown metric ──────────────────────────────────────────────────────────


def test_unknown_metric_is_silent() -> None:
    """Unknown metric (e.g. 'steps') should never fire."""
    assert detect_anomaly(_r("steps", 999999)) is None


# ── detect_all + dedup_key ──────────────────────────────────────────────────


def test_detect_all_returns_only_firing_readings() -> None:
    out = detect_all(
        [
            _r("heart_rate", 72),       # silent
            _r("heart_rate", 185),      # critical
            _r("spo2", 88),             # warning
            _r("steps", 9999),          # unknown — silent
        ]
    )
    assert len(out) == 2
    assert {a.severity for a in out} == {"critical", "warning"}


def test_dedup_key_is_minute_granular() -> None:
    """Two readings of the same metric in the same minute share a dedup_key."""
    base = datetime(2026, 5, 21, 12, 0, 15, tzinfo=timezone.utc)
    base_same_min = datetime(2026, 5, 21, 12, 0, 45, tzinfo=timezone.utc)
    a1 = detect_anomaly(VitalReading("heart_rate", 185, "bpm", base))
    a2 = detect_anomaly(VitalReading("heart_rate", 190, "bpm", base_same_min))
    assert a1 is not None and a2 is not None
    assert a1.dedup_key == a2.dedup_key


# ── parse_reading ───────────────────────────────────────────────────────────


def test_parse_reading_from_ehr_shape() -> None:
    raw = {
        "metric": "heart_rate",
        "value": "82",
        "unit": "bpm",
        "recorded_at": "2026-05-21T12:00:00Z",
    }
    r = parse_reading(raw)
    assert r is not None
    assert r.metric == "heart_rate"
    assert r.value == 82.0


def test_parse_reading_accepts_wearable_kind_alias() -> None:
    """Wearable sync uses 'kind' not 'metric' for the field name."""
    raw = {
        "kind": "heart_rate",
        "value": 72,
        "unit": "bpm",
        "recorded_at": "2026-05-21T12:00:00Z",
    }
    r = parse_reading(raw)
    assert r is not None
    assert r.metric == "heart_rate"


@pytest.mark.parametrize(
    "raw",
    [
        {},
        {"metric": None, "value": 1, "recorded_at": "2026-01-01T00:00:00Z"},
        {"metric": "x", "value": "not-a-number", "recorded_at": "2026-01-01T00:00:00Z"},
        {"metric": "x", "value": 1, "recorded_at": "garbage"},
        {"metric": "x", "value": 1},  # missing recorded_at
    ],
)
def test_parse_reading_returns_none_on_bad_input(raw: dict) -> None:
    assert parse_reading(raw) is None
