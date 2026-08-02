#!/usr/bin/env bash
#
# Dev seed for the booking slice.
#
#   scripts/seed.sh                # bring up what's needed, migrate, seed
#   scripts/seed.sh --no-up        # assume the stack is already running
#   scripts/seed.sh --no-migrate   # skip `alembic upgrade head`
#
# Seeds one verified patient and five listable doctors — enough to sign
# in, browse Find Care, open a provider profile and book. It deliberately
# does NOT seed booking_service: creating the booking is the thing the
# slice is meant to prove.
#
# Safe to run repeatedly. Users are matched by email and doctor profiles
# by their owning user_id, so a second run updates the existing rows
# instead of creating duplicates, and re-asserts the passwords printed at
# the end.
#
# The actual seeding lives in scripts/seed_dev_data.py and is executed
# INSIDE the user_service container, which is what lets it use each
# service's own layer/API over the compose network without depending on
# host-published ports, host Python, jq, or the gateway's auth rate
# limiter. See that file's docstring for the reasoning.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/infra/docker/docker-compose.yml}"
COMPOSE=(docker compose -f "$COMPOSE_FILE")

# Everything the booking slice touches. postgres/rabbitmq are
# dependencies; api_gateway is what the mobile app actually talks to.
SEED_SERVICES=(postgres rabbitmq api_gateway user_service doctor_service booking_service)
# Services whose schema the seed (or the flow right after it) needs.
MIGRATE_SERVICES=(user_service doctor_service booking_service)

DO_UP=1
DO_MIGRATE=1
for arg in "$@"; do
  case "$arg" in
    --no-up) DO_UP=0 ;;
    --no-migrate) DO_MIGRATE=0 ;;
    -h|--help) sed -n '3,23p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

log() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop and retry." >&2
  exit 1
fi

if [[ $DO_UP -eq 1 ]]; then
  log "Starting ${SEED_SERVICES[*]}"
  "${COMPOSE[@]}" up -d --build "${SEED_SERVICES[@]}"
fi

log "Waiting for user_service and doctor_service"
for svc in user_service doctor_service; do
  port=8001
  [[ $svc == doctor_service ]] && port=8002
  for attempt in $(seq 1 60); do
    if "${COMPOSE[@]}" exec -T "$svc" \
        curl -fsS "http://127.0.0.1:${port}/healthz" >/dev/null 2>&1; then
      echo "  $svc ready"
      break
    fi
    if [[ $attempt -eq 60 ]]; then
      echo "  $svc never became healthy — check '${COMPOSE[*]} logs $svc'" >&2
      exit 1
    fi
    sleep 2
  done
done

if [[ $DO_MIGRATE -eq 1 ]]; then
  log "Applying migrations"
  for svc in "${MIGRATE_SERVICES[@]}"; do
    echo "  $svc"
    "${COMPOSE[@]}" exec -T "$svc" alembic upgrade head >/dev/null
  done
fi

log "Seeding"
# `python -` reads the seeder from stdin so there is no bind mount or
# image rebuild required to pick up edits to seed_dev_data.py.
"${COMPOSE[@]}" exec -T user_service python - < "$REPO_ROOT/scripts/seed_dev_data.py"
