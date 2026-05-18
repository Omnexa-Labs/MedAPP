from ..schemas.doctor import DoctorDirectory


def list_doctors() -> DoctorDirectory:
    return DoctorDirectory()