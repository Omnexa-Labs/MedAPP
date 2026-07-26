from ..schemas.status import ServiceStatus


def get_service_status() -> ServiceStatus:
    return ServiceStatus(service="pharmacist_service", status="ready")
