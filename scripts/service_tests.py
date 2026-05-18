from __future__ import annotations

import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
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
    "social_service",
    "analytics_service",
]


def main() -> int:
    overall_exit_code = 0
    for service in BACKEND_SERVICES:
        tests_dir = REPO_ROOT / "backend" / "services" / service / "tests"
        if not tests_dir.is_dir():
            continue
        print(f"==> {service}")
        result = subprocess.run(
            [sys.executable, "-m", "pytest", str(tests_dir), "-q"],
            cwd=REPO_ROOT,
            check=False,
        )
        if result.returncode != 0:
            overall_exit_code = result.returncode
            break
    return overall_exit_code


if __name__ == "__main__":
    raise SystemExit(main())
