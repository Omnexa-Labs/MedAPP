"""PHI redaction for logs and traces.

Anything sent to Anthropic is in scope of our BAA, but our own logs and traces
should never contain raw PHI. Use `redact()` before structlog.bind() or before
attaching a payload to an OpenTelemetry span.
"""
import re

_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PHONE = re.compile(r"\+?\d[\d\s().-]{7,}\d")
_SSN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")


def redact(s: str) -> str:
    s = _EMAIL.sub("[email]", s)
    s = _PHONE.sub("[phone]", s)
    s = _SSN.sub("[ssn]", s)
    return s
