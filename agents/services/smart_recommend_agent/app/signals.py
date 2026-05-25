"""Signal types shared by the rule engine, pattern engine, and personalizer.

A `Signal` is what the deterministic layers produce. It is the *only* input
the LLM sees when personalising recommendations — the LLM cannot invent
signals from scratch (vision-doc requirement).

Keep `evidence` short and human-readable. It's both the audit trail (stored
verbatim in `recommendation_memory`) and the grounding the LLM uses when
phrasing the user-facing message.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

# Maps to the `kind` enum on `recommendation_memory` (see ADR 0003).
RecommendationKind = Literal["lifestyle", "medication", "followup", "labs", "wellness"]
Severity = Literal["info", "warn", "urgent"]

# Internal identifier — which engine produced the signal. Used for dedup and
# telemetry; never shown to the user.
SignalSource = Literal[
    "rule.dangerous_vital",
    "rule.no_recent_vitals",
    "rule.overdue_followup",
    "pattern.rising_metric",
    "pattern.declining_metric",
]


@dataclass(frozen=True)
class Signal:
    source: SignalSource
    kind: RecommendationKind
    severity: Severity
    title: str
    evidence: list[str] = field(default_factory=list)
    suggested_action: str = ""
    # For dedup across runs: a stable identifier for "the same issue".
    # e.g. "rising_metric:fasting_glucose" — a future run that re-detects
    # the same trend should update the existing recommendation, not create
    # a duplicate.
    dedup_key: str = ""
