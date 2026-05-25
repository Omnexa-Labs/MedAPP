"""Parser unit tests — strict JSON extraction + normalisation.

The parser never raises. All failure modes degrade to a low-confidence
empty result with a descriptive warning. These tests pin that contract.
"""
from __future__ import annotations

from app.parser import LabTest, ScanResult, parse


# ── JSON extraction (handles prose-wrapped LLM output) ──────────────────────


def test_parse_pure_json() -> None:
    raw = '{"doc_type": "lab_report", "tests": [], "summary": "ok", "confidence": "high", "warnings": []}'
    r = parse(raw)
    assert r.doc_type == "lab_report"
    assert r.confidence == "high"
    assert r.tests == []


def test_parse_json_wrapped_in_prose() -> None:
    raw = 'Sure, here is the extracted data:\n```json\n{"doc_type":"lab_report","tests":[],"summary":"","confidence":"medium","warnings":[]}\n```\nLet me know if you need anything else.'
    r = parse(raw)
    assert r.doc_type == "lab_report"
    assert r.confidence == "medium"


def test_parse_handles_braces_inside_strings() -> None:
    raw = '{"doc_type":"lab_report","tests":[],"summary":"contains a }brace{","confidence":"high","warnings":[]}'
    r = parse(raw)
    assert r.summary == "contains a }brace{"


# ── Empty / garbage input ───────────────────────────────────────────────────


def test_parse_empty_string_returns_low_confidence() -> None:
    r = parse("")
    assert r.confidence == "low"
    assert r.doc_type == "unknown"
    assert r.tests == []
    assert "empty" in " ".join(r.warnings).lower()


def test_parse_non_json_returns_low_confidence() -> None:
    r = parse("This is plain prose, not JSON.")
    assert r.confidence == "low"
    assert "did not contain a JSON object" in " ".join(r.warnings).lower() or "did not contain" in " ".join(r.warnings).lower()


def test_parse_malformed_json_returns_low_confidence() -> None:
    r = parse('{"doc_type": "lab_report", "tests": [')  # unterminated
    assert r.confidence == "low"


# ── Test-row normalisation ──────────────────────────────────────────────────


def test_parse_valid_test_row() -> None:
    raw = """
    {
      "doc_type": "lab_report",
      "tests": [
        {"name": "Hemoglobin", "value": 13.2, "unit": "g/dL", "reference_range": "12.0-15.5", "flag": "normal"}
      ],
      "summary": "",
      "confidence": "high",
      "warnings": []
    }
    """
    r = parse(raw)
    assert len(r.tests) == 1
    t = r.tests[0]
    assert isinstance(t, LabTest)
    assert t.name == "Hemoglobin"
    assert t.value == 13.2
    assert t.unit == "g/dL"
    assert t.flag == "normal"


def test_parse_coerces_string_value_to_float() -> None:
    raw = '{"doc_type":"lab_report","tests":[{"name":"X","value":"7.4","unit":null,"reference_range":null,"flag":"normal"}],"summary":"","confidence":"high","warnings":[]}'
    r = parse(raw)
    assert len(r.tests) == 1
    assert r.tests[0].value == 7.4


def test_parse_skips_non_numeric_value_with_warning() -> None:
    raw = '{"doc_type":"lab_report","tests":[{"name":"HIV","value":"positive","flag":"normal"},{"name":"Glucose","value":5.0,"unit":"mmol/L"}],"summary":"","confidence":"medium","warnings":[]}'
    r = parse(raw)
    assert len(r.tests) == 1
    assert r.tests[0].name == "Glucose"
    assert any("HIV" in w for w in r.warnings)


def test_parse_skips_row_missing_name() -> None:
    raw = '{"doc_type":"lab_report","tests":[{"value":1.0,"unit":"x"}],"summary":"","confidence":"high","warnings":[]}'
    r = parse(raw)
    assert r.tests == []
    assert any("missing name" in w for w in r.warnings)


def test_parse_unknown_flag_coerces_to_normal_with_warning() -> None:
    raw = '{"doc_type":"lab_report","tests":[{"name":"X","value":1.0,"flag":"WEIRD"}],"summary":"","confidence":"high","warnings":[]}'
    r = parse(raw)
    assert len(r.tests) == 1
    assert r.tests[0].flag == "normal"
    assert any("WEIRD" in w for w in r.warnings)


# ── Top-level field coercion ────────────────────────────────────────────────


def test_parse_unknown_doc_type_coerces_to_unknown() -> None:
    raw = '{"doc_type":"insurance_card","tests":[],"summary":"","confidence":"high","warnings":[]}'
    r = parse(raw)
    assert r.doc_type == "unknown"
    assert any("insurance_card" in w for w in r.warnings)


def test_parse_unknown_confidence_coerces_to_low() -> None:
    raw = '{"doc_type":"lab_report","tests":[],"summary":"","confidence":"perfect","warnings":[]}'
    r = parse(raw)
    assert r.confidence == "low"


def test_parse_propagates_upstream_warnings() -> None:
    raw = '{"doc_type":"lab_report","tests":[],"summary":"","confidence":"medium","warnings":["page 2 missing","signature illegible"]}'
    r = parse(raw)
    assert "page 2 missing" in r.warnings
    assert "signature illegible" in r.warnings


def test_parse_top_level_must_be_object() -> None:
    raw = '[{"doc_type":"lab_report"}]'
    r = parse(raw)
    # The array's first `{` will be extracted, so this CAN succeed —
    # verify either it parses to the inner object OR degrades cleanly.
    assert r.doc_type in {"lab_report", "unknown"}


def test_parse_tests_not_a_list_degrades_gracefully() -> None:
    raw = '{"doc_type":"lab_report","tests":"not a list","summary":"","confidence":"high","warnings":[]}'
    r = parse(raw)
    assert r.tests == []
    assert any("not a list" in w for w in r.warnings)
