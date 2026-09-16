from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="PMS_", extra="ignore")

    service_name: str = "pms_service"

    database_url: str = "postgresql+asyncpg://medapp:medapp@postgres:5432/medapp_pms"
    database_url_sync: str = "postgresql+psycopg://medapp:medapp@postgres:5432/medapp_pms"
    admin_database_url_sync: str = "postgresql+psycopg://medapp:medapp@postgres:5432/postgres"

    # Audit finding #2: no default secret. Set PMS_JWT_SECRET in env.
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_audience: str = "medapp.pms"
    jwt_issuer: str = "medapp.pms"
    access_token_ttl_minutes: int = 60 * 12
    medapp_deployment_key: str = ""
    onboarding_activation_secret: SecretStr = SecretStr("")
    medapp_jwt_secret: SecretStr = SecretStr("")
    medapp_jwt_algorithm: str = "HS256"
    medapp_jwt_audience: str = "medapp.platform"
    medapp_jwt_issuer: str = "medapp"
    user_service_url: str = "http://user_service:8001"

    otlp_endpoint: str | None = None
    log_level: str = "INFO"

    dev_mode: bool = False
    dev_database_url: str = "postgresql+asyncpg://medapp:medapp@localhost:5432/pms_dev"

    pharmacy_name: str = "Demo Pharmacy"
    pharmacy_slug: str = "demo"
    pharmacy_currency: str = "GHS"
    pharmacy_country: str = "GH"

    medapp_webhook_secret: str = ""
    medapp_dispense_webhook_url: str | None = None
    medapp_partner_id: str | None = None

    cors_allow_origins: str = "http://localhost:3002,http://127.0.0.1:3002"


settings = Settings()
