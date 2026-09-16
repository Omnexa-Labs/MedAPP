import smtplib
from unittest.mock import MagicMock

import pytest
from app.services.notifiers import EmailDeliveryError, SmtpEmailNotifier


@pytest.mark.asyncio
@pytest.mark.parametrize("security", ["starttls", "ssl", "none"])
async def test_smtp_transport_sends_message_with_selected_security(monkeypatch, security):
    connection = MagicMock()
    smtp = connection.return_value.__enter__.return_value
    monkeypatch.setattr(smtplib, "SMTP_SSL" if security == "ssl" else "SMTP", connection)
    notifier = SmtpEmailNotifier("localhost", 2525, "care@example.com", "user", "secret", security)
    await notifier.send(email="patient@example.com", subject="Recovery", body="Test reset code")
    message = smtp.send_message.call_args.args[0]
    assert message["To"] == "patient@example.com"
    assert message["From"] == "care@example.com"
    assert message.get_content().strip() == "Test reset code"
    assert smtp.starttls.call_count == (1 if security == "starttls" else 0)
    smtp.login.assert_called_once_with("user", "secret")
    assert "secret" not in repr(notifier)


@pytest.mark.asyncio
async def test_smtp_errors_are_wrapped_without_message_content(monkeypatch):
    monkeypatch.setattr(smtplib, "SMTP", MagicMock(side_effect=OSError("connection refused")))
    notifier = SmtpEmailNotifier("localhost", 2525, "care@example.com", security="none")
    with pytest.raises(EmailDeliveryError, match=r"^email delivery failed$"):
        await notifier.send(email="patient@example.com", subject="Recovery", body="Test reset code")
