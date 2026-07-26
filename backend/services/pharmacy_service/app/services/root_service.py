from ..schemas.status import ServiceStatus


def get_service_status() -> ServiceStatus:
    return ServiceStatus(service="pharmacy_service", status="ready")
