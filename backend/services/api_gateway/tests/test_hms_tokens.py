import time
from uuid import uuid4

import jwt
import pytest
from app.main import _extract_principal_from_token, settings
from pydantic import SecretStr
from shared.auth.jwt import issue_access_token

KEY = "gateway-hms-workspace-test-signing-secret-2026"


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret", "gateway-platform-test-signing-secret-2026")
    monkeypatch.setattr(settings, "hms_workspace_session_secret", SecretStr(KEY))


def token(**updates):
    claims = {
        "sub": str(uuid4()),
        "hospital_id": str(uuid4()),
        "role": "hms_staff",
        "typ": "access",
        "aud": "medapp.hms",
        "iss": "medapp.hms",
        "exp": int(time.time()) + 60,
        **updates,
    }
    return jwt.encode(
        {key: value for key, value in claims.items() if value is not None}, KEY, algorithm="HS256"
    )


@pytest.mark.parametrize("path", ["/v1/hms", "/v1/hms/patients", "/v1/hms/departments"])
def test_workspace_token_is_recognized_only_for_hms(path):
    assert _extract_principal_from_token(token(), path).role == "hms_staff"


@pytest.mark.parametrize(
    "path",
    ["", "/v1/admin", "/v1/users", "/v1/me", "/v1/hms-other", "/v1/hmss", "/v1/auth/refresh"],
)
def test_workspace_token_cannot_cross_service_boundaries(path):
    with pytest.raises(jwt.InvalidTokenError):
        _extract_principal_from_token(token(), path)


@pytest.mark.parametrize(
    "updates",
    [
        {"role": "admin"},
        {"typ": "refresh"},
        {"exp": None},
        {"hospital_id": "invalid"},
        {"sub": None},
        {"aud": "other"},
        {"iss": "other"},
        {"exp": 1},
    ],
)
def test_invalid_workspace_claims_are_rejected(updates):
    with pytest.raises((jwt.InvalidTokenError, ValueError, KeyError)):
        _extract_principal_from_token(token(**updates), "/v1/hms/patients")


def test_platform_session_can_reach_hms_exchange():
    signed = issue_access_token(subject=str(uuid4()), role="user", secret=settings.jwt_secret)
    assert _extract_principal_from_token(signed, "/v1/hms/auth/workspace-session").role == "user"


def test_missing_workspace_configuration_does_not_accept_scoped_token(monkeypatch):
    monkeypatch.setattr(settings, "hms_workspace_session_secret", SecretStr(""))
    with pytest.raises(jwt.InvalidTokenError):
        _extract_principal_from_token(token(), "/v1/hms/patients")
