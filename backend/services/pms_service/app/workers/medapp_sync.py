"""Run with python -m app.workers.medapp_sync [--once --limit 100]."""

import argparse
import asyncio
import logging

import httpx

from ..db import SessionLocal
from ..services.medapp_delivery import deliver_one

logger = logging.getLogger(__name__)


async def run(*, once=False, limit=100):
    async with httpx.AsyncClient(timeout=8, follow_redirects=False) as client:
        while True:
            try:
                for _ in range(limit):
                    if not await deliver_one(SessionLocal, client):
                        break
            except Exception:
                # Do not log HTTP bodies, credentials or prescription payloads.
                logger.error("MedApp sync worker failed; expired leases will be retried")
                if once:
                    raise
            if once:
                return
            await asyncio.sleep(2)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--limit", type=int, default=100, choices=range(1, 1001))
    arguments = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run(once=arguments.once, limit=arguments.limit))
