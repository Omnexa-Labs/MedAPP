"""Verify provider JWTs against fixed public-key endpoints and explicit audiences.

No provider credentials, tokens or authorization codes are logged or persisted.
Public keys are cached briefly; unknown key IDs cannot trigger an unbounded fetch.
"""
import asyncio
import secrets
import time

import httpx
import jwt

from ..config import settings
from .two_factor_service import FactorError

KEY_URLS = {"google": "https://www.googleapis.com/oauth2/v3/certs",
            "apple": "https://appleid.apple.com/auth/keys"}
ISSUERS = {"google": ["https://accounts.google.com", "accounts.google.com"],
           "apple": ["https://appleid.apple.com"]}
_keys: dict[str, tuple[float, dict]] = {}
_last_fetch: dict[str, float] = {}
_locks = {provider: asyncio.Lock() for provider in KEY_URLS}


def audiences(provider):
    value = settings.google_client_ids if provider == "google" else settings.apple_client_ids
    return [item.strip() for item in value.split(",") if item.strip()]


async def signing_key(provider, kid):
    async with _locks[provider]:
        now = time.monotonic()
        expires, keys = _keys.get(provider, (0, {}))
        if now < expires and kid in keys:
            return keys[kid]
        if now - _last_fetch.get(provider, -100) < 30:
            raise FactorError("Provider verification is temporarily unavailable. Try again shortly.", 503)
        _last_fetch[provider] = now
        try:
            async with httpx.AsyncClient(timeout=5, follow_redirects=False) as client:
                response = await client.get(KEY_URLS[provider])
                response.raise_for_status()
                # Both endpoints return small public key sets. Do not accept arbitrary algorithms.
                keys = {key["kid"]: jwt.PyJWK.from_dict(key, algorithm="RS256").key
                        for key in response.json()["keys"]
                        if key.get("kty") == "RSA" and key.get("use", "sig") == "sig"
                        and key.get("alg", "RS256") == "RS256"}
        except (httpx.HTTPError, ValueError, KeyError, TypeError, jwt.PyJWTError) as exc:
            raise FactorError("Provider verification is temporarily unavailable. Try again shortly.", 503) from exc
        _keys[provider] = (now + 300, keys)
        if kid not in keys:
            raise FactorError("Provider sign-in could not be verified. Start again.", 401)
        return keys[kid]


async def verify(provider, token, nonce, *, allowed_audiences=None):
    # The override is supplied only by trusted server callers, never a request field.
    allowed = audiences(provider) if allowed_audiences is None else allowed_audiences
    if not allowed:
        raise FactorError("This sign-in provider is not available yet. Use email and password.", 503)
    try:
        header = jwt.get_unverified_header(token)
        if header.get("alg") != "RS256" or not isinstance(header.get("kid"), str):
            raise ValueError("unsupported key")
        key = await signing_key(provider, header["kid"])
        claims = jwt.decode(token, key, algorithms=["RS256"], audience=allowed,
            issuer=ISSUERS[provider], leeway=30,
            options={"require": ["sub", "iss", "aud", "exp", "iat", "nonce"]})
        if (not isinstance(claims["nonce"], str) or not secrets.compare_digest(claims["nonce"], nonce)
                or not isinstance(claims["sub"], str) or not 1 <= len(claims["sub"]) <= 255
                or not isinstance(claims["aud"], str)
                or (claims.get("azp") is not None and claims["azp"] not in allowed)):
            raise ValueError("invalid identity binding")
        return claims
    except (jwt.PyJWTError, ValueError, TypeError) as exc:
        raise FactorError("Provider sign-in could not be verified. Start again.", 401) from exc
