from enum import StrEnum

from fastapi import Depends, HTTPException, status

from .principal import Principal, get_current_principal


class Role(StrEnum):
    USER = "user"
    DOCTOR = "doctor"
    NURSE = "nurse"
    HOSPITAL_ADMIN = "hospital_admin"
    ADMIN = "admin"


def require_roles(*allowed: Role):
    async def _checker(principal: Principal = Depends(get_current_principal)) -> Principal:
        if principal.role not in {r.value for r in allowed}:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "insufficient role")
        return principal

    return _checker
