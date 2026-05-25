"""Triage scanner tests.

These are the *floor* of medical safety. False negatives (missing an
emergency) are far worse than false positives. The cases below cover the
seven vision-doc categories plus a couple of common paraphrasings.
"""
import pytest

from agents.shared.triage import classify


@pytest.mark.parametrize(
    "message, category",
    [
        # Chest pain
        ("I have crushing chest pain", "chest_pain"),
        ("my chest feels really tight", "chest_pain"),
        ("the pain is radiating to my left arm", "chest_pain"),
        ("I think I'm having a heart attack", "chest_pain"),
        # Stroke
        ("I think I'm having a stroke", "stroke"),
        ("my face is drooping on one side", "stroke"),
        ("she has slurred speech and sudden weakness in her arm", "stroke"),
        # Breathing
        ("I can't breathe", "breathing"),
        ("she's choking", "breathing"),
        ("severe shortness of breath since this morning", "breathing"),
        # Bleeding
        ("the wound won't stop bleeding", "bleeding"),
        ("severe bleeding from a cut on the leg", "bleeding"),
        ("massive haemorrhage", "bleeding"),
        # Suicide
        ("I want to kill myself", "suicide"),
        ("I'm having suicidal thoughts", "suicide"),
        ("I want to die", "suicide"),
        # Seizure
        ("my brother is having a seizure right now", "seizure"),
        ("she's convulsing", "seizure"),
        # Unconscious
        ("he's unconscious and not breathing", "unconscious"),
        ("she passed out and is unresponsive", "unconscious"),
    ],
)
def test_emergency_phrases_are_caught(message: str, category: str) -> None:
    result = classify(message)
    assert result.level == "emergency", f"missed: {message!r}"
    assert result.category == category, f"wrong category for {message!r}: got {result.category}"
    assert result.recommended_reply is not None
    assert len(result.recommended_reply) > 50


@pytest.mark.parametrize(
    "message",
    [
        "I have a mild headache",
        "I need to book an appointment",
        "what does my last lab result mean?",
        "can you remind me to take my medication?",
        "my throat is a little sore",
        "",
        "hello",
    ],
)
def test_non_emergency_phrases_pass_through(message: str) -> None:
    result = classify(message)
    assert result.level == "normal"
    assert result.category is None
    assert result.recommended_reply is None


def test_empty_message_is_normal() -> None:
    assert classify("").level == "normal"


def test_first_category_match_wins() -> None:
    # Both chest pain and suicide ideation — chest pain comes first in
    # _PATTERNS, so we expect that to be reported.
    result = classify("I have crushing chest pain and I want to kill myself")
    assert result.level == "emergency"
    assert result.category == "chest_pain"


def test_case_insensitive() -> None:
    assert classify("MY CHEST HURTS WITH CRUSHING PRESSURE").level == "emergency"
    assert classify("Crushing Chest Pain").level == "emergency"
