from __future__ import annotations

import json
import logging

logger = logging.getLogger(__name__)


async def handle_partner_approved(message_body: bytes) -> None:
    data = json.loads(message_body)
    event_data = data.get("data", {})
    partner_type = event_data.get("partner_type")
    onboarding_mode = event_data.get("onboarding_mode")

    if partner_type != "hospital" or onboarding_mode != "team":
        logger.debug("ignoring partner.approved event: type=%s mode=%s", partner_type, onboarding_mode)
        return

    hospital_id = event_data.get("hospital_id")
    hospital_name = event_data.get("hospital_name", "Unknown Hospital")
    slug = event_data.get("slug", hospital_id)

    logger.info(
        "received partner.approved for hospital team: id=%s name=%s",
        hospital_id,
        hospital_name,
    )
