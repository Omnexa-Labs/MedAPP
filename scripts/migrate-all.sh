#!/usr/bin/env bash
set -euo pipefail

SERVICES=(user_service doctor_service nurse_service hospital_service booking_service \
          payment_service telemedicine_service notification_service lab_service \
          ehr_service social_service analytics_service)

for svc in "${SERVICES[@]}"; do
  dir="backend/services/$svc"
  if [[ -f "$dir/alembic.ini" ]]; then
    echo "==> migrating $svc"
    (cd "$dir" && uv run alembic upgrade head)
  fi
done
