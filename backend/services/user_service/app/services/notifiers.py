"""Outbound transport abstractions for OTP / password-reset / verification emails.

Email uses configurable SMTP; tests can swap in `InMemoryNotifier`.
The legacy log transports remain available for explicitly selected development
uses. Password recovery does not use a log transport.
"""

from __future__ import annotations

import asyncio
import smtplib
import ssl
from dataclasses import dataclass, field
from email.message import EmailMessage
from typing import Literal, Protocol

from shared.observability import get_logger

log = get_logger(__name__)


class SmsNotifier(Protocol):
    async def send(self, *, phone: str, body: str) -> None: ...


class EmailNotifier(Protocol):
    async def send(self, *, email: str, subject: str, body: str) -> None: ...


class EmailDeliveryError(RuntimeError):
    """A transport failure without recipient, credentials, or message content."""


@dataclass
class SmtpEmailNotifier:
    host: str
    port: int
    sender: str
    username: str | None = None
    password: str | None = field(default=None, repr=False)
    security: Literal["starttls", "ssl", "none"] = "starttls"
    timeout: float = 10

    async def send(self, *, email: str, subject: str, body: str) -> None:
        # smtplib is blocking; keep socket operations off the ASGI event loop.
        try:
            await asyncio.to_thread(self._send, email, subject, body)
        except (OSError, smtplib.SMTPException) as exc:
            raise EmailDeliveryError("email delivery failed") from exc

    def _send(self, email: str, subject: str, body: str) -> None:
        message = EmailMessage()
        message["From"] = self.sender
        message["To"] = email
        message["Subject"] = subject
        message.set_content(body)
        context = ssl.create_default_context()
        connection = (
            smtplib.SMTP_SSL(self.host, self.port, timeout=self.timeout, context=context)
            if self.security == "ssl"
            else smtplib.SMTP(self.host, self.port, timeout=self.timeout)
        )
        with connection as smtp:
            if self.security == "starttls":
                smtp.starttls(context=context)
            if self.username:
                smtp.login(self.username, self.password or "")
            smtp.send_message(message)


class LogSmsNotifier:
    async def send(self, *, phone: str, body: str) -> None:
        log.info("sms.sent", phone=_mask_phone(phone), body=body)


class LogEmailNotifier:
    async def send(self, *, email: str, subject: str, body: str) -> None:
        log.info("email.sent", email=_mask_email(email), subject=subject, body=body)


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
