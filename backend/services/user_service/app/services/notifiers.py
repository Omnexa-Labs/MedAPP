"""Outbound transport abstractions for OTP / password-reset / verification emails.

These are intentionally thin Protocols. The real implementations (Twilio
Verify, SendGrid) plug in later; until then, `LogSmsNotifier` and
`LogEmailNotifier` write to the structured log so dev/test flows work end-
to-end without provider keys. Test code can swap in `InMemoryNotifier` to
assert on what would have been sent.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from shared.observability import get_logger

log = get_logger(__name__)


class SmsNotifier(Protocol):
    async def send(self, *, phone: str, body: str) -> None: ...


class EmailNotifier(Protocol):
    async def send(self, *, email: str, subject: str, body: str) -> None: ...


class LogSmsNotifier:
    async def send(self, *, phone: str, body: str) -> None:
        log.info("sms.sent", phone=_mask_phone(phone), body=body)


class LogEmailNotifier:
    async def send(self, *, email: str, subject: str, body: str) -> None:
        log.info("email.sent", email=_mask_email(email), subject=subject)


@dataclass
class InMemoryNotifier:
    """Test double — collect everything that would have been sent."""

    sms: list[dict] = field(default_factory=list)
    emails: list[dict] = field(default_factory=list)

    async def send_sms(self, *, phone: str, body: str) -> None:
        self.sms.append({"phone": phone, "body": body})

    async def send_email(self, *, email: str, subject: str, body: str) -> None:
        self.emails.append({"email": email, "subject": subject, "body": body})


def _mask_phone(p: str) -> str:
    return f"{p[:4]}***{p[-2:]}" if len(p) >= 6 else "***"


def _mask_email(e: str) -> str:
    local, _, domain = e.partition("@")
    return f"{local[:2]}***@{domain}" if domain else "***"
