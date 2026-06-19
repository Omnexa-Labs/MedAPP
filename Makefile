
.PHONY: help dev dev-all up down stop restart rebuild logs ps shell migrate migrate-all revision seed fmt lint test check gen-clients pms-dev pms-migrate pms-seed pms-test pms-web

SHELL := bash
COMPOSE_FILE := infra/docker/docker-compose.yml
COMPOSE := docker compose -f $(COMPOSE_FILE)

BACKEND_INFRA := postgres redis mongodb qdrant rabbitmq otel-collector
BACKEND_SERVICES := api_gateway user_service doctor_service nurse_service hospital_service booking_service payment_service telemedicine_service notification_service inbox_service lab_service ehr_service social_service analytics_service
AGENT_SERVICES := concierge_agent smart_recommend_agent medical_chat_agent lab_reader_agent vitals_watcher_agent booking_agent
DEFAULT_STACK := $(BACKEND_INFRA) $(BACKEND_SERVICES)
FULL_STACK := $(DEFAULT_STACK) $(AGENT_SERVICES)
KNOWN_SERVICES := $(BACKEND_SERVICES) $(AGENT_SERVICES)

SERVICE ?=
SERVICES ?=
MESSAGE ?=
TARGET_SERVICES := $(strip $(if $(SERVICES),$(SERVICES),$(SERVICE)))

define validate_services
for svc in $(1); do \
	case " $(KNOWN_SERVICES) " in \
		*" $$svc "*) ;; \
		*) echo "Unknown service: $$svc"; echo "Known services: $(KNOWN_SERVICES)"; exit 1 ;; \
	esac; \
done
endef

help: ## Show available make targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-15s %s\n", $$1, $$2}'

dev: ## Boot the backend local stack (infra + backend services)
	$(COMPOSE) up -d --build $(DEFAULT_STACK)

dev-all: ## Boot backend services plus the Claude agents
	$(COMPOSE) up -d --build $(FULL_STACK)

up: ## Start one or more services; use SERVICE=user_service or SERVICES="user_service api_gateway"
	@if [ -z "$(TARGET_SERVICES)" ]; then \
		$(COMPOSE) up -d --build $(DEFAULT_STACK); \
	else \
		$(call validate_services,$(TARGET_SERVICES)); \
		$(COMPOSE) up -d --build $(TARGET_SERVICES); \
	fi

down: ## Stop and remove the backend stack
	$(COMPOSE) down

stop: ## Stop one or more running services without removing the stack
	@if [ -z "$(TARGET_SERVICES)" ]; then \
		echo "Usage: make stop SERVICE=user_service"; \
		exit 1; \
	fi
	$(call validate_services,$(TARGET_SERVICES))
	$(COMPOSE) stop $(TARGET_SERVICES)

restart: ## Restart one or more services; defaults to the backend stack
	@if [ -z "$(TARGET_SERVICES)" ]; then \
		$(COMPOSE) restart $(DEFAULT_STACK); \
	else \
		$(call validate_services,$(TARGET_SERVICES)); \
		$(COMPOSE) restart $(TARGET_SERVICES); \
	fi

rebuild: ## Rebuild and restart one or more services; defaults to the backend stack
	@if [ -z "$(TARGET_SERVICES)" ]; then \
		$(COMPOSE) up -d --build $(DEFAULT_STACK); \
	else \
		$(call validate_services,$(TARGET_SERVICES)); \
		$(COMPOSE) up -d --build $(TARGET_SERVICES); \
	fi

logs: ## Tail logs for the selected services or the backend stack
	@if [ -z "$(TARGET_SERVICES)" ]; then \
		$(COMPOSE) logs -f --tail=100 $(DEFAULT_STACK); \
	else \
		$(call validate_services,$(TARGET_SERVICES)); \
		$(COMPOSE) logs -f --tail=100 $(TARGET_SERVICES); \
	fi

ps: ## Show compose service status
	$(COMPOSE) ps

shell: ## Open a shell in one running service; use SERVICE=user_service
	@if [ -z "$(TARGET_SERVICES)" ]; then \
		echo "Usage: make shell SERVICE=user_service"; \
		exit 1; \
	fi
	$(call validate_services,$(TARGET_SERVICES))
	$(COMPOSE) exec $(firstword $(TARGET_SERVICES)) sh

migrate: ## Apply migrations for one service or all migratable backend services
	@uv run python scripts/service_migrations.py migrate $(if $(TARGET_SERVICES),$(TARGET_SERVICES),)

migrate-all: migrate ## Apply migrations across every backend service that owns Alembic

revision: ## Create a new Alembic revision; use SERVICE=user_service MESSAGE="add users table"
	@if [ -z "$(TARGET_SERVICES)" ] || [ -z "$(MESSAGE)" ]; then \
		echo "Usage: make revision SERVICE=user_service MESSAGE=\"add users table\""; \
		exit 1; \
	fi
	$(call validate_services,$(TARGET_SERVICES))
	@uv run python scripts/service_migrations.py revision --message "$(MESSAGE)" $(TARGET_SERVICES)

seed: ## Seed local databases with fixtures
	bash scripts/seed.sh

fmt: ## Format Python and mobile frontend code
	ruff format backend agents
	cd frontend/mobile/MedAPP && npm run format

lint: ## Lint Python and mobile frontend code
	ruff check backend agents
	cd frontend/mobile/MedAPP && npm run lint

test: ## Run the backend Python test suite
	@python scripts/service_tests.py

check: lint test ## Run lint and tests

gen-clients: ## Regenerate TypeScript clients from OpenAPI specs
	bash scripts/gen-clients.sh

# ── PMS (Pharmacy Management System) template ─────────────────────────────────

PMS_SVC_DIR := backend/services/pms_service
PMS_WEB_DIR := frontend/pms_web

pms-dev: ## Boot pms_service + pms_web via docker compose
	$(COMPOSE) up -d --build postgres pms_service pms_web

pms-migrate: ## Apply Alembic migrations for pms_service
	cd $(PMS_SVC_DIR) && UV_LINK_MODE=copy uv run alembic upgrade head

pms-seed: ## Seed the pharmacy with admin staff, drugs, and a supplier
	cd $(PMS_SVC_DIR) && UV_LINK_MODE=copy uv run python -m app.seed

pms-test: ## Run the pms_service pytest suite
	cd $(PMS_SVC_DIR) && UV_LINK_MODE=copy uv run --extra test pytest -q

pms-web: ## Start pms_web in dev mode (Next.js on :3002)
	cd $(PMS_WEB_DIR) && npm install && npm run dev
