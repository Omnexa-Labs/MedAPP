"""Stock visibility through confirmed, operator-configured PMS deployments."""

import hashlib
import hmac
from urllib.parse import urlencode
from uuid import UUID

import httpx
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..config import settings
from ..models import PharmacyDeployment
from ..schemas.pharmacy import PharmacyStockBadgeOut


class StockLookupError(Exception):
    """This pharmacy has no confirmed PMS deployment."""


class StockRow(BaseModel):
    drug_name: str
    quantity_on_hand: int = Field(ge=0, strict=True)
    selling_price_cents: int = Field(ge=0, strict=True)
    currency: str = Field(min_length=3, max_length=3)


class StockResponse(BaseModel):
    pharmacy_id: UUID
    items: list[StockRow]


def _sign_request(method: str, path: str, body: bytes, secret: str) -> str:
    return hmac.new(
        secret.encode(), f"{method.upper()}\n{path}\n".encode() + body, hashlib.sha256
    ).hexdigest()


async def check_drug_at_pharmacy(pharmacy, drug_name, db) -> PharmacyStockBadgeOut:
    binding = await db.scalar(
        select(PharmacyDeployment).where(
            PharmacyDeployment.pharmacy_id == pharmacy.id,
            PharmacyDeployment.activated_at.is_not(None),
        )
    )
    config = settings.pms_deployments.get(binding.deployment_key) if binding else None
    if not config:
        raise StockLookupError("pharmacy has no confirmed pharmacy management system")
    path = "/v1/integrations/medapp/stock-availability?" + urlencode({"drug_name": drug_name})
    signature = _sign_request("GET", path, b"", config.stock_secret.get_secret_value())
    unknown = PharmacyStockBadgeOut(
        pharmacy_id=pharmacy.id, drug_name=drug_name, available=False, source="unknown"
    )
    try:
        async with httpx.AsyncClient(
            timeout=settings.stock_http_timeout_seconds, follow_redirects=False, trust_env=False
        ) as client:
            response = await client.get(
                config.api_url + path, headers={"X-MedApp-Signature": signature}
            )
        if response.status_code != 200:
            return unknown
        stock = StockResponse.model_validate(response.json())
        if stock.pharmacy_id != pharmacy.id:
            return unknown
    except (httpx.RequestError, ValueError):
        return unknown
    matches = [
        row for row in stock.items if row.drug_name.casefold() == drug_name.strip().casefold()
    ]
    if len(matches) > 1:
        # A name alone cannot distinguish multiple formulations/strengths.
        return unknown
    if not matches:
        return PharmacyStockBadgeOut(
            pharmacy_id=pharmacy.id, drug_name=drug_name, available=False, quantity=0
        )
    row = matches[0]
    return PharmacyStockBadgeOut(
        pharmacy_id=pharmacy.id,
        drug_name=drug_name,
        available=row.quantity_on_hand > 0,
        quantity=row.quantity_on_hand,
        price_cents=row.selling_price_cents,
        currency=row.currency,
    )
