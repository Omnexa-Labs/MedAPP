#!/usr/bin/env bash
#
# Run `alembic upgrade head` for every backend service that has migrations.
#
# The service list is DISCOVERED, not hardcoded. It used to be a literal array
# of 13 names, which silently went stale as services were added: by the time
# this comment was written, hms_service, onboarding_service, pharmacist_service,
# pharmacy_service, pms_service and wearable_sync_service all had migrations and
# none of them were listed, so their databases were never brought to head and
# those services failed at startup against empty schemas. Globbing for
# alembic.ini keeps this honest — a new service with migrations is picked up the
# moment it exists.
#
# Run from the repository root. Each service's alembic.ini resolves its own
# database URL, so the Postgres in `infra/docker/docker-compose.yml` must be
# reachable (it publishes 5432 on the host).
set -euo pipefail

cd "$(dirname "$0")/.."

failed=()
migrated=0

for ini in backend/services/*/alembic.ini; do
  dir="$(dirname "$ini")"
  svc="$(basename "$dir")"
  echo "==> migrating $svc"
  # Keep going on failure so one broken service does not hide the state of the
  # rest; the summary below is the actual result of the run.
  if (cd "$dir" && uv run alembic upgrade head); then
    migrated=$((migrated + 1))
  else
    echo "!!! $svc FAILED" >&2
    failed+=("$svc")
  fi
done

echo
echo "migrated: $migrated"
if ((${#failed[@]})); then
  echo "failed:   ${failed[*]}" >&2
  exit 1
fi
