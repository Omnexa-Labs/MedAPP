"""Analyzer: composes the rule + pattern engines.

Pure function. The agent gathers context via tools, then calls `analyze`.
Result is a deduplicated list of `Signal`s — input for the personalizer.
"""
from __future__ import annotations

from .patterns import detect_all_trends
from .rules import ALL_RULES, AnalysisContext
from .signals import Signal


def analyze(ctx: AnalysisContext) -> list[Signal]:
    """Run all engines, return a deduplicated signal list.

    Deduplication is by `dedup_key` — if two engines produce a signal for
    the same underlying issue, we keep the higher-severity one.
    """
    raw: list[Signal] = []
    for rule in ALL_RULES:
        s = rule(ctx)
        if s is not None:
            raw.append(s)
    raw.extend(detect_all_trends(ctx))

    return _dedup(raw)


_SEVERITY_RANK = {"info": 0, "warn": 1, "urgent": 2}


def _dedup(signals: list[Signal]) -> list[Signal]:
    by_key: dict[str, Signal] = {}
    no_key: list[Signal] = []
    for s in signals:
        if not s.dedup_key:
            no_key.append(s)
            continue
        existing = by_key.get(s.dedup_key)
        if existing is None or _SEVERITY_RANK[s.severity] > _SEVERITY_RANK[existing.severity]:
            by_key[s.dedup_key] = s
    return list(by_key.values()) + no_key
