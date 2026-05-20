"""CLI for provisioning a new hospital tenant.

Usage:
    python -m app.cli.provision --hospital-id <uuid> --hospital-name "Name" --slug "name-slug"
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from uuid import UUID


async def _main(hospital_id: UUID, hospital_name: str, slug: str) -> None:
    from ..db import MgmtSessionLocal
    from ..schemas.tenant import TenantCreate
    from ..services.tenant_service import provision_tenant

    body = TenantCreate(
        hospital_id=hospital_id,
        hospital_name=hospital_name,
        slug=slug,
    )
    async with MgmtSessionLocal() as db:
        try:
            tenant = await provision_tenant(body, db)
            await db.commit()
            print(f"Provisioned tenant: {tenant.id} (db=hms_{slug.replace('-', '_')})")
        except Exception as exc:
            await db.rollback()
            print(f"Error: {exc}", file=sys.stderr)
            sys.exit(1)


def cli() -> None:
    parser = argparse.ArgumentParser(description="Provision a new HMS tenant")
    parser.add_argument("--hospital-id", required=True, type=UUID, help="UUID of the hospital")
    parser.add_argument("--hospital-name", required=True, help="Display name")
    parser.add_argument("--slug", required=True, help="URL-safe slug for the hospital")
    args = parser.parse_args()
    asyncio.run(_main(args.hospital_id, args.hospital_name, args.slug))


if __name__ == "__main__":
    cli()
