from ..schemas import PaymentStatus


def get_service_status() -> dict[str, str]:
    return {"service": "payment_service", "status": "ready"}