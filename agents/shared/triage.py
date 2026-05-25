"""Deterministic emergency triage.

The vision doc lists 7 categories that must escalate immediately and should
not be left to LLM judgement:

  chest pain, stroke symptoms, difficulty breathing, severe bleeding,
  suicidal ideation, seizures, unconsciousness

This module owns the scan. Agents call `classify(message)` *before* the LLM
runs. If `level != "normal"`, the agent should:

1. Return a deterministic emergency reply (`recommended_reply` here).
2. Skip the LLM.
3. Persist the turn to memory with `emergency: true`.
4. Optionally send a notification through the normal tool channel.

This is a *floor*, not a ceiling. The LLM prompt still includes escalation
language for cases the keyword scan misses (e.g. "I want to end it" without
the word "suicide"). False positives are preferable to false negatives.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

TriageLevel = Literal["normal", "emergency"]

EmergencyCategory = Literal[
    "chest_pain",
    "stroke",
    "breathing",
    "bleeding",
    "suicide",
    "seizure",
    "unconscious",
]


@dataclass(frozen=True)
class TriageResult:
    level: TriageLevel
    category: EmergencyCategory | None = None
    matched: str | None = None
    recommended_reply: str | None = None


# Keyword patterns. Lowercased, word-boundary anchored where helpful.
# Order matters for `matched` reporting — first match wins.
_PATTERNS: tuple[tuple[EmergencyCategory, re.Pattern[str]], ...] = (
    (
        "chest_pain",
        re.compile(
            # "chest" followed within the sentence by a pain/pressure indicator.
            # Loose .* (non-greedy) so "chest feels really tight" matches.
            r"\bchest\b[^.!?\n]*?\b(pain|pressure|tight|tightness|crushing|squeezing|hurts?|aching|heavy|burning)\b"
            # Reverse order: "crushing/squeezing ... chest"
            r"|\b(crushing|squeezing)\b[^.!?\n]*?\bchest\b"
            r"|\bheart attack\b"
            r"|\bpain\b[^.!?\n]*?radiat\w*[^.!?\n]*?(arm|jaw|shoulder)",
            re.IGNORECASE,
        ),
    ),
    (
        "stroke",
        re.compile(
            r"\bstroke\b"
            r"|\bface\b[^.!?\n]*?droop\w*"
            r"|\bslurred speech\b"
            r"|\bsudden\b[^.!?\n]*?(numb\w*|weak\w*|paralysis|paralysed|paralyzed)[^.!?\n]*?(arm|leg|face|side)"
            r"|\bcan\W?t speak\b",
            re.IGNORECASE,
        ),
    ),
    (
        "breathing",
        re.compile(
            r"\b(can\W?t breathe)\b"
            r"|\b(cannot breathe)\b"
            r"|\b(struggling to breathe)\b"
            r"|\b(severe(ly)? short(ness)? of breath)\b"
            r"|\b(choking)\b"
            r"|\b(turning blue)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "bleeding",
        re.compile(
            r"\b(severe bleed(ing)?)\b"
            r"|\b(won\W?t stop bleeding)\b"
            r"|\b(bleeding heavily)\b"
            r"|\b(bleeding out)\b"
            r"|\b(haemorrhag\w*|hemorrhag\w*)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "suicide",
        re.compile(
            r"\b(suicid\w*)\b"
            r"|\b(kill myself)\b"
            r"|\b(end (my|it all) life)\b"
            r"|\b(want to die)\b"
            r"|\b(no reason to live)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "seizure",
        re.compile(
            r"\b(seizure)\b"
            r"|\b(convuls\w*)\b"
            r"|\b(fitt?ing)\b"
            r"|\b(epileptic (fit|attack))\b",
            re.IGNORECASE,
        ),
    ),
    (
        "unconscious",
        re.compile(
            r"\b(unconscious)\b"
            r"|\b(passed out)\b"
            r"|\b(won\W?t wake)\b"
            r"|\b(not breathing)\b"
            r"|\b(unresponsive)\b",
            re.IGNORECASE,
        ),
    ),
)


_REPLIES: dict[EmergencyCategory, str] = {
    "chest_pain": (
        "This sounds like it could be a medical emergency. **Please call your "
        "local emergency number now** or get to the nearest emergency room. "
        "Chest pain — especially with pain spreading to the arm, jaw, or "
        "shoulder, sweating, nausea, or shortness of breath — needs immediate "
        "in-person evaluation. If you're with someone, ask them to help you. "
        "Do not drive yourself."
    ),
    "stroke": (
        "This sounds like a possible stroke. **Call your local emergency "
        "number immediately.** Time matters — every minute counts. Note when "
        "the symptoms started; share that with the responders. Do not eat, "
        "drink, or take any medication while you wait."
    ),
    "breathing": (
        "Severe difficulty breathing is a medical emergency. **Call your "
        "local emergency number now.** Sit upright, loosen tight clothing, "
        "and try to stay calm. If you have a rescue inhaler or prescribed "
        "emergency medication, use it as directed."
    ),
    "bleeding": (
        "Severe bleeding needs emergency care. **Call your local emergency "
        "number now.** Apply firm, direct pressure on the wound with a clean "
        "cloth and keep it pressed. Elevate the area above heart level if "
        "you can. Do not remove the cloth even if it soaks through — add more "
        "on top."
    ),
    "suicide": (
        "I'm really glad you reached out. Your life matters, and you don't "
        "have to handle this alone. **Please contact a crisis line right "
        "now.** If you are in immediate danger, call your local emergency "
        "number. If you can, tell someone you trust where you are. I'm here "
        "with you, and the people on those lines are trained to help."
    ),
    "seizure": (
        "If someone is having a seizure: **call your local emergency number** "
        "if it lasts more than 5 minutes, repeats, or this is their first "
        "seizure. Move sharp objects away, do not put anything in their "
        "mouth, do not restrain them, and roll them onto their side once the "
        "shaking stops. Stay with them until help arrives."
    ),
    "unconscious": (
        "An unresponsive person needs emergency care. **Call your local "
        "emergency number immediately.** If they are not breathing and you "
        "are trained in CPR, begin chest compressions. Keep them on their "
        "side if they are breathing. Do not give them food, water, or "
        "medication."
    ),
}


def classify(message: str) -> TriageResult:
    """Scan a user message for emergency indicators.

    Returns `level="normal"` if nothing matched, else the first matched
    category with a recommended deterministic reply.
    """
    if not message:
        return TriageResult(level="normal")
    for category, pattern in _PATTERNS:
        m = pattern.search(message)
        if m:
            return TriageResult(
                level="emergency",
                category=category,
                matched=m.group(0),
                recommended_reply=_REPLIES[category],
            )
    return TriageResult(level="normal")
