from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="PHARMACY_", extra="ignore")

    service_name: str = "pharmacy_service"
    database_url: str = "postgresql+asyncpg://medapp:medapp@postgres:5432/medapp_pharmacies"
    rabbitmq_url: str = "amqp://medapp:medapp@rabbitmq:5672/"
    otlp_endpoint: str | None = None
    log_level: str = "INFO"

    # When a PharmacyProfile carries a pms_base_url, we call upstream
    # pms_service for stock visibility. Each pms_service rejects calls
    # without a valid HMAC signature; the secret below is what we sign
    # with. In production this should be per-pharmacy (looked up via
    # pms_partner_secret_id) — for the dev stack one global value is OK.
    medapp_partner_secret: str = "medapp_dev_partner_secret_change_me"
    # Timeout for upstream stock calls. Keep tight — a slow pms_service
    # must not block the patient app's directory render.
    stock_http_timeout_seconds: float = 3.0


settings = Settings()
