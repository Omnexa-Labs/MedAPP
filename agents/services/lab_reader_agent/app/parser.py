"""Parse + normalize the extraction LLM's JSON output.

The vision model is instructed to return a strict JSON object (see
`agents/prompts/_lab_reader_extraction.md`). LLMs in practice wrap that
output in prose, code fences, or extra commentary. This module:

  1. Extracts the JSON object from arbitrary surrounding text.
  2. Validates it against the expected schema.
  3. Normalises field types (value → float, flag → known enum, etc.).
  4. Coerces invalid rows into warnings rather than rejecting the whole
     scan — partial reads are still useful.

Returns a `ScanResult` regardless of input quality. The worst case is
`confidence="low"` with an empty `tests` list and a warnings array —
never a raised exception. Callers do not need to wrap this in try/except.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Literal

logger = logging.getLogger(__name__)


DocType = Literal["lab_report", "prescription", "unknown"]
TestFlag = Literal["normal", "low", "high", "critical"]
Confidence = Literal["high", "medium", "low"]

_VALID_DOC_TYPES: set[str] = {"lab_report", "prescription", "unknown"}
_VALID_FLAGS: set[str] = {"normal", "low", "high", "critical"}
_VALID_CONFIDENCE: set[str] = {"high", "medium", "low"}


@dataclass(frozen=True)
class LabTest:
    name: str
    value: float
    unit: str | None
    reference_range: str | None
    flag: TestFlag


@dataclass(frozen=True)
class ScanResult:
    doc_type: DocType
    tests: list[LabTest] = field(default_factory=list)
    summary: str = ""
    confidence: Confidence = "low"
    warnings: list[str] = field(default_factory=list)


# A sentinel returned when even the JSON extraction step fails. Callers
# treat this exactly the same as any other low-confidence result.
def _empty_unreadable(reason: str) -> ScanResult:
    return ScanResult(
        doc_type="unknown",
        tests=[],
        summary="Unable to read the document.",
        confidence="low",
        warnings=[reason],
    )


def parse(raw: str) -> ScanResult:
    """Parse arbitrary LLM output into a validated `ScanResult`.

    Never raises. The worst output is a low-confidence empty result with
    a single warning describing the failure.
    """
    if not raw or not raw.strip():
        return _empty_unreadable("LLM returned an empty response")

    payload = _extract_json_object(raw)
    if payload is None:
        return _empty_unreadable("LLM output did not contain a JSON object")

    try:
        data = json.loads(payload)
    except json.JSONDecodeError as e:
        logger.warning("lab_reader.json_parse_failed err=%s", e)
        return _empty_unreadable("LLM output was not valid JSON")
    if not isinstance(data, dict):
        return _empty_unreadable("LLM output was not a JSON object")

    return _normalize(data)


# ── Normalisation ────────────────────────────────────────────────────────────


def _normalize(data: dict[str, Any]) -> ScanResult:
    warnings: list[str] = []

    raw_doc = data.get("doc_type", "unknown")
    doc_type: DocType = raw_doc if raw_doc in _VALID_DOC_TYPES else "unknown"
    if raw_doc not in _VALID_DOC_TYPES:
        warnings.append(f"unknown doc_type '{raw_doc}' from extractor; coerced to 'unknown'")

    summary_raw = data.get("summary", "")
    summary = summary_raw.strip() if isinstance(summary_raw, str) else ""

    raw_conf = data.get("confidence", "low")
    confidence: Confidence = raw_conf if raw_conf in _VALID_CONFIDENCE else "low"
    if raw_conf not in _VALID_CONFIDENCE:
        warnings.append(f"unknown confidence '{raw_conf}'; coerced to 'low'")

    upstream_warnings = data.get("warnings", [])
    if isinstance(upstream_warnings, list):
        for w in upstream_warnings:
            if isinstance(w, str) and w.strip():
                warnings.append(w.strip())

    tests: list[LabTest] = []
    raw_tests = data.get("tests", [])
    if isinstance(raw_tests, list):
        for i, row in enumerate(raw_tests):
            parsed = _parse_test_row(row, index=i, warnings_out=warnings)
            if parsed is not None:
                tests.append(parsed)
    elif raw_tests:
        warnings.append("'tests' field was not a list; ignored")

    return ScanResult(
        doc_type=doc_type,
        tests=tests,
        summary=summary,
        confidence=confidence,
        warnings=warnings,
    )


def _parse_test_row(
    row: Any, *, index: int, warnings_out: list[str]
) -> LabTest | None:
    if not isinstance(row, dict):
        warnings_out.append(f"test row {index}: not an object; skipped")
        return None
    name = row.get("name")
    if not isinstance(name, str) or not name.strip():
        warnings_out.append(f"test row {index}: missing name; skipped")
        return None
    name = name.strip()

    raw_value = row.get("value")
    try:
        value = float(raw_value)
    except (TypeError, ValueError):
        warnings_out.append(
            f"test '{name}': value '{raw_value}' is not numeric; skipped"
        )
        return None

    unit_raw = row.get("unit")
    unit = unit_raw.strip() if isinstance(unit_raw, str) and unit_raw.strip() else None

    range_raw = row.get("reference_range")
    reference_range = (
        range_raw.strip() if isinstance(range_raw, str) and range_raw.strip() else None
    )

    flag_raw = row.get("flag", "normal")
    if flag_raw not in _VALID_FLAGS:
        warnings_out.append(
            f"test '{name}': unknown flag '{flag_raw}'; coerced to 'normal'"
        )
        flag: TestFlag = "normal"
    else:
        flag = flag_raw  # type: ignore[assignment]

    return LabTest(
        name=name, value=value, unit=unit, reference_range=reference_range, flag=flag
    )


# ── JSON extraction (handles prose-wrapped output) ──────────────────────────


def _extract_json_object(text: str) -> str | None:
    """Find the outermost `{...}` in text. Handles strings + balanced braces.

    LLMs sometimes wrap their JSON in markdown code fences, leading
    explanation, or trailing commentary. We hunt for the first `{` and
    walk to its matching `}`, respecting string literals.
    """
    text = text.strip()
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if escape:
            escape = False
            continue
        if ch == "\\":
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


__all__ = ["LabTest", "ScanResult", "parse"]
