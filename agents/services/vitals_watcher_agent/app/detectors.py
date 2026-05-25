"""Acute vital-sign anomaly detectors.

Unlike `smart_recommend_agent`'s engines (longitudinal — trends, drifts),
Vitals Watcher runs on **single recent samples**. The goal is to spot
"this reading needs eyes on it now," not "this trend warrants a
follow-up in two weeks."

Each detector is a pure function: `(VitalReading) -> Anomaly | None`.
No I/O, no shared state — the agent fetches samples once via tools and
runs all detectors over each sample.

Severity tiers:
  - **critical** — outside crisis ranges; downstream should consider a
    push notification, not just a feed entry. Examples: SpO2 < 88,
    sustained HR > 180, BP > 200/120.
  - **warning** — outside the safe range but not immediately dangerous.
    Worth mentioning at the next consultation. Examples: HR 130–180,
    SpO2 88–92.

Thresholds are conservative — closer to "should be looked at" than
"definitely an emergency." False positives are preferable to false
negatives for the acute-monitoring role.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal

Severity = Literal["warning", "critical"]


@dataclass(frozen=True)
class VitalReading:
    """One sample, normalised. Source: `ehr_service` vitals timeline."""

    metric: str         # "heart_rate" | "spo2" | "systolic_bp" | "diastolic_bp" | ...
    value: float
    unit: str | None
    recorded_at: datetime


@dataclass(frozen=True)
class Anomaly:
    """Output of one detector firing on one sample."""

    severity: Severity
    metric: str
    value: float
    unit: str | None
    recorded_at: datetime
    rationale: str
    # For dedup at the event level: a stable key so consumers can fold
    # multiple events for the same anomaly into one notification.
    dedup_key: str = ""


# ── Thresholds (per-metric, critical first) ─────────────────────────────────
# Tuple shape: (low_critical, low_warning, high_warning, high_critical)
# None means no bound at that tier.
_RANGES: dict[str, tuple[float | None, float | None, float | None, float | None]] = {
    # Heart rate is "resting" unless context says otherwise. The wearable
    # event doesn't tell us if the patient was exercising, so we err
    # conservative and accept the false-positive rate on workouts.
    "heart_rate":    (35.0,  40.0,  130.0, 180.0),  # bpm
    "spo2":          (None,  92.0,  None,  None),   # %, only-lower bound matters
    "systolic_bp":   (None,  None,  180.0, 200.0),  # mmHg
    "diastolic_bp":  (None,  None,  110.0, 120.0),
    "fasting_glucose": (50.0,  None,  None,  None),  # crisis hypoglycaemia only
    # Below 88 we mark *critical* even though warning range is empty above.
    # The order of checks below handles that case.
}

# SpO2 has only a lower bound and uses a different shape, so handle it
# explicitly. Anything below 88% is critical.
_SPO2_CRITICAL_LOW = 88.0


# ── Detectors ───────────────────────────────────────────────────────────────


def detect_anomaly(reading: VitalReading) -> Anomaly | None:
    """Single entry point — picks the right detector for the metric.

    Returns the **highest-severity** anomaly matching this reading, or None
    if it's inside the safe range.
    """
    if reading.metric == "spo2":
        return _check_spo2(reading)
    ranges = _RANGES.get(reading.metric)
    if ranges is None:
        return None
    low_c, low_w, high_w, high_c = ranges
    v = reading.value

    # Critical takes priority over warning if the value qualifies for both.
    if low_c is not None and v < low_c:
        return _make(
            reading,
            severity="critical",
            rationale=f"{reading.metric} {v} is critically low (< {low_c})",
        )
    if high_c is not None and v > high_c:
        return _make(
            reading,
            severity="critical",
            rationale=f"{reading.metric} {v} is critically high (> {high_c})",
        )
    if low_w is not None and v < low_w:
        return _make(
            reading,
            severity="warning",
            rationale=f"{reading.metric} {v} is below the safe range (< {low_w})",
        )
    if high_w is not None and v > high_w:
        return _make(
            reading,
            severity="warning",
            rationale=f"{reading.metric} {v} is above the safe range (> {high_w})",
        )
    return None


def detect_all(readings: list[VitalReading]) -> list[Anomaly]:
    """Run `detect_anomaly` over a batch. Filters Nones."""
    out: list[Anomaly] = []
    for r in readings:
        a = detect_anomaly(r)
        if a is not None:
            out.append(a)
    return out


# ── SpO2 dedicated detector ─────────────────────────────────────────────────


def _check_spo2(reading: VitalReading) -> Anomaly | None:
    if reading.value < _SPO2_CRITICAL_LOW:
        return _make(
            reading,
            severity="critical",
            rationale=f"SpO2 {reading.value}% is critically low (< {_SPO2_CRITICAL_LOW}%)",
        )
    # Warning band: 88–92 inclusive
    if reading.value < 92.0:
        return _make(
            reading,
            severity="warning",
            rationale=f"SpO2 {reading.value}% is below the safe range (< 92%)",
        )
    return None


# ── Helpers ─────────────────────────────────────────────────────────────────


def _make(reading: VitalReading, *, severity: Severity, rationale: str) -> Anomaly:
    # Dedup by (metric, recorded_at minute) so a wearable that uploads the
    # same sample twice doesn't double-alert.
    minute = reading.recorded_at.replace(second=0, microsecond=0).isoformat()
    return Anomaly(
        severity=severity,
        metric=reading.metric,
        value=reading.value,
        unit=reading.unit,
        recorded_at=reading.recorded_at,
        rationale=rationale,
        dedup_key=f"{reading.metric}:{minute}",
    )


# ── Convenience: parse a raw EHR vital dict into a VitalReading ─────────────


def parse_reading(raw: dict[str, Any]) -> VitalReading | None:
    """Best-effort coercion of an EHR/wearable sample dict into a VitalReading."""
    metric = raw.get("metric") or raw.get("kind")
    if not isinstance(metric, str):
        return None
    val = raw.get("value")
    try:
        value = float(val)
    except (TypeError, ValueError):
        return None
    unit_raw = raw.get("unit")
    unit = unit_raw if isinstance(unit_raw, str) else None
    ts_raw = raw.get("recorded_at")
    ts = _to_dt(ts_raw)
    if ts is None:
        return None
    return VitalReading(metric=metric, value=value, unit=unit, recorded_at=ts)


def _to_dt(raw: Any) -> datetime | None:
    from datetime import timezone
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    if isinstance(raw, str):
        try:
            ts = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


__all__ = [
    "Anomaly",
    "VitalReading",
    "detect_all",
    "detect_anomaly",
    "parse_reading",
]
