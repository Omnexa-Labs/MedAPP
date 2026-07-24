"""Stock-visibility bridge to upstream pms_service.

For each pharmacy that carries a `pms_base_url`, we can ask its
operational system whether a given drug is in stock. pms_service exposes
GET /v1/integrations/medapp/stock-availability?drug_name=X behind an
HMAC-signed partner token (see plan, Task #5).

This call MUST be defensive:

  - Treat any non-200 / timeout / network error as "available=False,
    source=unknown" rather than propagating 5xx. The directory must not
    be brittle to one pharmacy's pms_service being down.
  - Honour a tight timeout (settings.stock_http_timeout_seconds). The
    patient app is waiting on this — slow > a few seconds is worse than
    saying "unknown".
  - Never log the partner secret. Never include it in error messages
    or trace spans.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from urllib.parse import urlencode

import httpx

from ..config import settings
from ..models import PharmacyProfile
from ..schemas.pharmacy import PharmacyStockBadgeOut

log = logging.getLogger(__name__)


class StockLookupError(Exception):
    """Raised when stock lookup is impossible (no pms_base_url set).

    Lookups that fail at the network layer don't raise — they return
    `available=False, source="unknown"`. Only structural impossibility
    (no upstream configured for this pharmacy) raises so the router
    can 404 cleanly.
    """


def _sign_request(method: str, path: str, body: bytes, secret: str) -> str:
    """HMAC-SHA256 over the canonical (method, path, body) triple.

    Matches the prescription-webhook signing convention in pms_service.
    pms_service's `verify_signature` reads the same canonical form, so
    keeping this in lockstep is the contract. If the canonical form
    changes in pms_service, change it here in the same commit.
    """
    msg = f"{method.upper()}\n{path}\n".encode() + body
    digest = hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()
    return digest


async def check_drug_at_pharmacy(
    pharmacy: PharmacyProfile,
    drug_name: str,
) -> PharmacyStockBadgeOut:
    """Ask the pharmacy's pms_service whether a drug is in stock.

    Returns a PharmacyStockBadgeOut; never raises on network failure.
    Raises StockLookupError only if the pharmacy isn't wired to a pms
    (no `pms_base_url` configured) — the router maps that to a 404.
    """
    if not pharmacy.pms_base_url:
        raise StockLookupError("pharmacy is not wired to a pharmacy management system")

    base = pharmacy.pms_base_url.rstrip("/")
    path = "/v1/integrations/medapp/stock-availability"
    query = urlencode({"drug_name": drug_name})
    url = f"{base}{path}?{query}"

    # Signing path includes the query string so an attacker can't pivot
    # a signed request from drug X to drug Y by swapping the URL.
    canonical_path = f"{path}?{query}"
    signature = _sign_request("GET", canonical_path, b"", settings.medapp_partner_secret)
    headers = {"X-MedApp-Signature": signature}

    try:
        async with httpx.AsyncClient(timeout=settings.stock_http_timeout_seconds) as client:
            resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            log.warning(
                "stock_lookup_upstream_error",
                extra={"pharmacy_id": str(pharmacy.id), "status": resp.status_code},
            )
            return PharmacyStockBadgeOut(
                pharmacy_id=pharmacy.id,
                drug_name=drug_name,
                available=False,
                source="unknown",
            )
        body = resp.json()
    except (httpx.TimeoutException, httpx.NetworkError) as exc:
        # Don't include exc detail in the response — could leak internal
        # hostnames. Log it instead and degrade gracefully.
        log.warning(
            "stock_lookup_network_error",
            extra={"pharmacy_id": str(pharmacy.id), "error": str(exc)},
        )
        return PharmacyStockBadgeOut(
            pharmacy_id=pharmacy.id,
            drug_name=drug_name,
            available=False,
            source="unknown",
        )

    # pms_service returns {"items": [StockAvailabilityRow]} — we pick
    # the best-matching row (case-insensitive equality on drug_name),
    # falling back to the first row if no exact match. If no rows at
    # all, "not in stock" is the correct answer.
    rows = body.get("items", []) if isinstance(body, dict) else []
    if not rows:
        return PharmacyStockBadgeOut(
            pharmacy_id=pharmacy.id,
            drug_name=drug_name,
            available=False,
            quantity=0,
        )

    target = drug_name.lower()
    best = next((r for r in rows if r.get("drug_name", "").lower() == target), rows[0])
    qty = int(best.get("quantity_on_hand", 0))
    return PharmacyStockBadgeOut(
        pharmacy_id=pharmacy.id,
        drug_name=drug_name,
        available=qty > 0,
        quantity=qty,
        price_cents=best.get("selling_price_cents") or best.get("default_selling_price_cents"),
        currency=best.get("currency"),
    )
