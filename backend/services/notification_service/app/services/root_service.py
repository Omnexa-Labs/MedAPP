from ..schemas import NotificationPreferenceOut


def get_service_status() -> dict[str, str]:
    return {"service": "notification_service", "status": "ready"}