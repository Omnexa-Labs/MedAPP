"""Audit finding B-2 regression: aud + iss claims on every minted token.

Lives under user_service (the main consumer of shared/auth) but tests the
shared library directly. Validates:

  - Newly-minted tokens include `aud` and `iss` claims by default.
  - `decode_token(audience=X)` rejects a token whose aud doesn't match.
  - `decode_token(audience=None)` does NOT reject — backward compat for
    services that haven't enabled aud verification yet.
  - Algorithm pinning (B-3) — explicit `alg=none` forgery is rejected.
"""
from __future__ import annotations

import pytest
import jwt as pyjwt

from shared.auth.jwt import (
    DEFAULT_AUDIENCE,
    DEFAULT_ISSUER,
    decode_token,
    issue_access_token,
    issue_refresh_token,
)


_SECRET = "test-secret-for-shared-jwt-32-bytes-long-padding"


def test_access_token_includes_aud_and_iss() -> None:
    token = issue_access_token(
        subject="user-1", role="patient", secret=_SECRET
    )
    # Decode without verification just to inspect the payload.
    payload = pyjwt.decode(
        token,
        _SECRET,
        algorithms=["HS256"],
        options={"verify_aud": False, "verify_iss": False},
    )
    assert payload["aud"] == DEFAULT_AUDIENCE
    assert payload["iss"] == DEFAULT_ISSUER
    assert payload["typ"] == "access"


def test_refresh_token_includes_aud_and_iss() -> None:
    token = issue_refresh_token(subject="user-1", secret=_SECRET)
    payload = pyjwt.decode(
        token,
        _SECRET,
        algorithms=["HS256"],
        options={"verify_aud": False, "verify_iss": False},
    )
    assert payload["aud"] == DEFAULT_AUDIENCE
    assert payload["iss"] == DEFAULT_ISSUER
    assert payload["typ"] == "refresh"


def test_decode_accepts_token_when_audience_matches() -> None:
    token = issue_access_token(subject="user-1", role="patient", secret=_SECRET)
    claims = decode_token(
        token, secret=_SECRET, audience=DEFAULT_AUDIENCE, issuer=DEFAULT_ISSUER
    )
    assert claims["sub"] == "user-1"


def test_decode_rejects_wrong_audience() -> None:
    """Audit B-2: a token minted for one platform must not validate
    against a service expecting a different audience."""
    token = issue_access_token(
        subject="user-1", role="patient", secret=_SECRET, audience="staging.platform"
    )
    with pytest.raises(pyjwt.InvalidAudienceError):
        decode_token(token, secret=_SECRET, audience=DEFAULT_AUDIENCE)


def test_decode_rejects_wrong_issuer() -> None:
    token = issue_access_token(
        subject="user-1", role="patient", secret=_SECRET, issuer="other-issuer"
    )
    with pytest.raises(pyjwt.InvalidIssuerError):
        decode_token(token, secret=_SECRET, issuer=DEFAULT_ISSUER)


def test_decode_with_no_audience_skips_aud_check() -> None:
    """Backward compat during rollout: services without
    `MEDAPP_DEFAULT_JWT_AUDIENCE` set don't verify aud — old tokens still
    validate. This will be tightened once every minter is on the new flow."""
    token = issue_access_token(
        subject="user-1", role="patient", secret=_SECRET, audience="anything"
    )
    claims = decode_token(token, secret=_SECRET, audience=None)
    assert claims["sub"] == "user-1"


def test_decode_pins_algorithm_alg_none_rejected() -> None:
    """Audit B-3: forged `alg=none` tokens must be rejected even if the
    attacker controls the algorithm field."""
    # Build a token with alg=none (no signature).
    unsigned = pyjwt.encode(
        {"sub": "attacker", "role": "admin"},
        key="",
        algorithm="none",
    )
    with pytest.raises(pyjwt.InvalidTokenError):
        decode_token(unsigned, secret=_SECRET, algorithm="HS256")


def test_decode_rejects_wrong_algorithm() -> None:
    """A token signed with a different algorithm to the expected one is
    rejected — algorithms is pinned to a single-element list."""
    # HS512 token decoded as HS256
    token = pyjwt.encode(
        {"sub": "u1", "role": "patient"},
        _SECRET,
        algorithm="HS512",
    )
    with pytest.raises(pyjwt.InvalidTokenError):
        decode_token(token, secret=_SECRET, algorithm="HS256")
