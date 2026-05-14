
.PHONY: help dev down logs fmt lint test migrate seed gen-clients

SHELL := bash
COMPOSE := docker compose -f infra/docker/docker-compose.yml

help:
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-15s %s\n", $$1, $$2}'

dev: ## Boot full local stack (db + all services)
	$(COMPOSE) up -d --build

down: ## Stop local stack
	$(COMPOSE) down

logs: ## Tail logs from all services
	$(COMPOSE) logs -f --tail=100

fmt: ## Format Python + Dart
	ruff format backend ml
	cd frontend/mobile && dart format lib test

lint: ## Lint Python + Dart
	ruff check backend ml
	cd frontend/mobile && flutter analyze

test: ## Run Python tests across all services
	cd backend && pytest -q

migrate: ## Run Alembic migrations for all services
	bash scripts/migrate-all.sh

seed: ## Seed local databases with fixtures
	bash scripts/seed.sh

gen-clients: ## Regenerate Dart + TS clients from OpenAPI specs
	bash scripts/gen-clients.sh
