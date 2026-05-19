from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
COMPOSE_FILE = REPO_ROOT / "infra" / "docker" / "docker-compose.yml"
BACKEND_SERVICES = [
    "api_gateway",
    "user_service",
    "doctor_service",
    "nurse_service",
    "hospital_service",
    "booking_service",
    "payment_service",
    "telemedicine_service",
    "notification_service",
    "inbox_service",
    "lab_service",
    "ehr_service",
    "wearable_sync_service",
    "social_service",
    "analytics_service",
]


def _service_dir(service: str) -> Path:
    return REPO_ROOT / "backend" / "services" / service


def _database_name(service: str) -> str | None:
    config_path = _service_dir(service) / "app" / "config.py"
    if not config_path.is_file():
        return None
    match = re.search(r'database_url:\s*str\s*=\s*"[^"]*:(\d+)/(\w+)"', config_path.read_text(encoding="utf-8"))
    if not match:
        return None
    return match.group(2)


def _ensure_database_exists(service: str) -> None:
    database_name = _database_name(service)
    if not database_name:
        return
    exists = subprocess.run(
        [
            "docker",
            "compose",
            "-f",
            str(COMPOSE_FILE),
            "exec",
            "-T",
            "postgres",
            "psql",
            "-U",
            "medapp",
            "-d",
            "postgres",
            "-tAc",
            f"SELECT 1 FROM pg_database WHERE datname = '{database_name}'",
        ],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    if "1" not in exists.stdout:
        subprocess.run(
            [
                "docker",
                "compose",
                "-f",
                str(COMPOSE_FILE),
                "exec",
                "-T",
                "postgres",
                "createdb",
                "-U",
                "medapp",
                database_name,
            ],
            cwd=REPO_ROOT,
            check=True,
        )


def _run_alembic(service: str, args: list[str]) -> None:
    service_dir = _service_dir(service)
    if not service_dir.is_dir():
        print(f"Skipping {service} (not a backend service)")
        return
    if not (service_dir / "alembic.ini").is_file():
        print(f"Skipping {service} (no alembic.ini)")
        return
    _ensure_database_exists(service)
    print(f"==> {args[0]} {service}")
    subprocess.run(
        [
            "docker",
            "compose",
            "-f",
            str(COMPOSE_FILE),
            "run",
            "--rm",
            "--build",
            service,
            "alembic",
            *args,
        ],
        cwd=REPO_ROOT,
        check=True,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Alembic tasks for backend services.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    migrate_parser = subparsers.add_parser("migrate", help="Apply migrations")
    migrate_parser.add_argument("services", nargs="*", help="Service names to migrate")

    revision_parser = subparsers.add_parser("revision", help="Create a revision")
    revision_parser.add_argument("--message", required=True)
    revision_parser.add_argument("services", nargs="+")

    args = parser.parse_args()

    if args.command == "migrate":
        services = args.services or BACKEND_SERVICES
        for service in services:
            _run_alembic(service, ["upgrade", "head"])
        return 0

    if args.command == "revision":
        for service in args.services:
            _run_alembic(service, ["revision", "--autogenerate", "-m", args.message])
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())